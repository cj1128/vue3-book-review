# Vue3 Book Review

- [Chapter 1: 权衡的艺术](#chapter-1-权衡的艺术)
- [Chapter 2: 框架设计的核心要素](#chapter-2-框架设计的核心要素)
- [Chapter 3: Vue3 的设计思路](#chapter-3-vue3-的设计思路)
- [Chapter 4: 响应系统的作用与实现](#chapter-4-响应系统的作用与实现)
- [Chapter 5: 非原始值的响应式方案](#chapter-5-非原始值的响应式方案)
- [Chapter 6: 原始值的响应式方案](#chapter-6-原始值的响应式方案)
- [Chapter 7: 渲染器](#chapter-7-渲染器)
- [Chapter 8: 挂载与更新](#chapter-8-挂载与更新)

## Chapter 1: 权衡的艺术

- > 声明式代码的性能不优于命令式代码的性能。
- 我们可以从这三个维度去评价各项技术
  - 心智负担
  - 可维护性
  - 性能
- > 设计一个框架的时候，我们有三种选择：纯运行时的，运行时+编译时的或者纯编译时的。

## Chapter 2: 框架设计的核心要素

- 提升用户的开发体验
  - > 在框架的设计和开发过程中，提供友好的警告信息至关重要。
  - `warn` 函数
  - `initCustomFormatter` 配合浏览器的 `Enable custom formatters`

- Tree Shaking
  - `/* #__PURE__ */` 用于标识一个函数调用是无副作用的，主要用于 tree shaking 当中。
  -
    ```js
    // util.js
    export const foo() {
    }

    // 这里如果不进行标注，那么 main.js 中会包含 abc() 的调用，
    // 因为打包器无法判断 abc 这个函数是否有副作用，只能将其引入进来
    export const a = abc()

    // export const a = /*#__PURE__*/ abc()

    export const bar() {
    }

    // main.js
    import { foo } from "./util"
    ```
  - 使用 `rollup main.js -f esm -o bundle.js` 进行打包，会发现，首先 `bar` 一定会被 treeShake 掉，但是 `abc` 是否会被 treeShake 掉取决于是否添加了 `/* #__PRUE__ */` 的注释。

- > 使用TS编写代码与对TS类型支持友好是两件事。

## Chapter 3: Vue3 的设计思路

- > 渲染器的作用就是把虚拟 DOM 渲染成真实 DOM

## Chapter 4: 响应系统的作用与实现

基于 Proxy 的响应式系统。

- 挑战1: 分支切换与 cleanup
  - 副作用函数中可能会读取不同的字段，意味着依赖收集要进行更新
    ```javascript
    const data = {ok: true, text: "hello world"}
    cosnt obj = new Proxy(data, ...)

    effect(function() {
      document.body.innerText = obj.ok ? obj.text : "not"
    })
    ```
  - 这个问题的解决方案也很简单：每次副作用函数执行时，首先清除依赖关系，执行的过程中重新收集依赖关系
- 挑战2: effect 的嵌套
  - 解决：使用一个 stack 来进行 effect 函数的管理
- 挑战3: 避免无限递归
  ```javascript
  const data = {foo: 1}
  const obj = new Proxy(data, ...)

  effect(() => obj.foo++)
  ```
  - 解决：增加一个判断，如果取出来的副作用函数就是当前函数，那么不进行调用
- **可调度性**：当 trigger 动作触发副作用函数重新执行时，有能力决定副作用函数执行的时机，次数以及方式。
  - 使用 effect 注册副作用函数时，可以传递第二个参数制定一个调度器 scheduler
    ```js
    const jobQueue = new Set()
    const p = Promise.resolve()

    let isFlushing = false
    function flushJob() {
      if(isFlushing) return
      isFlushing = true

      p.then(() => {
        jobQueue.forEach(job => job())
      }).finally(() => {
        isFlushing = false
      })
    }

    effect(() => {
    }, {
      scheduler(fn) {
        jobQueue.add(fn)
        flushJob()
      }
    })

    ```
- computed and lazy
  - computed 本质上是一个 lazy 的副作用函数
  - effect 可以指定参数 `lazy`，如果 lazy=true，那么副作用函数不会被立即执行，此时，我们将副作用函数返回，用户可以手动进行执行
- watch
  - 使用一个 traverse 函数读取对象的所有属性从而建立起响应关联
  - 使用 `lazy` 属性来实现传递 `oldValue` 和 `newValue` 和 watch handler
  - 使用 `onInvalidate` 让副作用函数过期从而避免竟态问题

## Chapter 5: 非原始值的响应式方案

- 实现响应式数据还有很多挑战
  - 如何拦截 `for in`
  - 如何代理数组
  - 如何代理其他集合类型，例如 Map, Set, WeakMap, WeakSet
- Proxy & Reflect
  - Proxy: 实现对 **其他对象** 的 **代理**，所谓代理，指的是“拦截并重新定义对一个对象的基本操作“
  - 使用 Reflect 来解决 `this` 指向的问题，下面的代码如果不用 Reflect 直接使用 `target[key]` 会丢失掉对 foo 属性的响应性
    ```js
    const obj = {
      foo: 1,
      get bar() {
        return this.foo
      }
    }

    const p = reactive(obj)
    effect(() => {
      console.log(p.bar)
    })
    ```
- Object & Proxy
  - JS 中的对象分为普通对象 Ordinary Object 和 异质对象 Exotic Object，任何不属于普通对象的都是异质对象
  - 如何区分一个普通对象和一个函数对象？看对象是否部署了 `[[Call]]` 这个内部方法
  - 普通对象：内部方法的需要符合 ECMA 相应的规范，不符合的则是异质对象
  - Proxy 的内部方法 `[[Get]]` 没有使用相应规范，因此是异质对象
- Handle Object
  - 一个普通对象所有可能的读取操作
    - 访问属性: `obj.foo`
      - 使用 `get` 拦截
    - 判断对象或原型链上是否存在某个 key: `key in obj`
      - 使用 `has` 拦截
    - `for in` 循环遍历对象
      - 使用 `ownKeys` 拦截
    - 删除属性
      - 使用 `deleteProperty` 拦截
- 合理触发
  - 比对新旧值，值不一样才触发
    - `===` 比较符有一个缺陷就是无法处理 `NaN`
    - 注意不能使用 `isNaN` 来判断，这个函数只能接收数字参数，其他类型会被 coerce 到数字，例如 `isNaN({}) === true`
  - 处理原型链
    - 如果对象自身不存在某属性，设置属性时，会获取对象的原型，并调用原型的 `[[Set]]` 方法
- 浅响应和深响应
  - 浅响应：只有对象的第一层是有响应的
- 只读和浅只读
  - 只读：本质上还是对对象进行代理，并在用户修改对象时，提示用户
  - 修改包括：`set`, `deleteProperty`
- 代理数组
  - 数组是异质对象，因为它的 `[[DefineOwnProperty]]` 方法与普通对象不同
  - 数组的操作很丰富
    - 读取
      - `arr[0]`
      - `arr.length`
      - `for in`, `for of`
      - `concat/join/every/some/find/findIndex...`
    - 设置
      - `arr[0] = 1`
      - `arr.length = 0`
      - `push/pop/shift/unshift/splice/fill/sort...`
  - 当使用索引设置数组的值时，可能会隐式修改 `length` 属性，反过来也一样，修改 `length` 也可能会影响索引的值
  - `for in`
    - 添加新元素和设置数组长度都会影响 for in
  - `for of`
    - `for of` 会读取数组的 length 属性，还会使用索引读取数组的值
    - 这两点处理了，那么 for of 就没问题了
  - 数组的查找方法
    - 需要覆盖原生的 `includes/indexOf/lastIndexOf` 方法
  - 隐式修改数字长度的原型方法
    - `push/pop/shift/unshift`
    - 两个独立的副作用函数互相影响导致循环调用，这里的问题在于 `push` 隐式读取了 length，解决方案是阻止 `length` 读取和副作用函数之间建立联系
      ```js
      const arr = reactive([])

      effect(() => {
        arr.push(1)
      })

      effect(() => {
        arr.push(2)
      })
      ```
    - TODO: 注意，"互相影响”的问题其实并没有解决，如下的代码依旧会报错
      ```js
      const obj = reactive({id:1})

      effect(() => {
        obj.id++
      })

      effect(() => {
        obj.id++
      })
      ```
- 代理 Set 和 Map
  - `size` 属性读取时要正确设置 this
  - `add`/`delete` 这些方法需要重新实现，和数组一样
  - 避免数据污染
    - 把响应式数据设置到原始数据上的行为称为【数据污染】
      - 准确来说应该是使用代理进行操作时，避免这种行为
      - 因为用户永远都可以手动将响应式数据设置到原始数据上
    - 这里其实是要维护一个统一的心智模型，即：只有使用代理（响应式数据）进行操作才可以获得响应性
  - `forEach`
    - 覆盖 forEach 方法
      - 确保深响应，传递给 forEach 的参数需要进行响应性包装
      - `SET` 操作也需要重新触发 `forEach`
  - 迭代器方法：`entries`/`keys`/`values`
    - 注意区别 `iterable` 和 `iterator`
    - `iterable`: 实现了 `Symbol.iterator` 方法
    - `iterator`: 实现了 `next` 方法

## Chapter 6: 原始值的响应式方案

- 原始值: `Boolean`, `Number`, `BigInt`, `String`, `Symbol`, `undefined`, `null`
  - 按值传递，而不是按引用传递
- ref
  - 原始值无法拦截，必须包装在对象中
  - 引入 `ref` 函数进行规范化包装
  - 定义一个 `__v_isRef` 属性来区别 “原始值的包裹对象” 和 “非原始值的响应对象”
- `toRef` && `toRefs`
- 自动脱 ref (auto unwrap)
  - 通过代理实现
  - 如果发现是一个 ref（通过检查 `__v_isRef` 属性），读取时自动返回 `.value` 值，设置时也是一样的道理

## Chapter 7: 渲染器

- Vue 的很多功能依赖渲染器实现：Transition组件，Teleport组件，Suspense组件，template ref 以及自定义指令
- 渲染器也是框架跨平台能力的关键，通过实现针对不同平台的渲染器，可以将 Vue 用在不同的平台上
- 渲染器的基本概念
  - 把虚拟 DOM 节点渲染成真实 DOM 节点的过程叫作“挂载“，英文是 mount
  - 渲染器不仅可以用来渲染，还可以用来激活已有的 DOM 元素，不仅包含 `render` 函数，还包含 `hydrate` 函数
  - patch 函数是渲染器的核心
- 自定义渲染器
  - 将平台特定的 API 作为参数传递给 `createRenderer`

## Chapter 8: 挂载与更新

- HTML Attributes vs DOM Properties
  - https://javascript.info/dom-attributes-and-properties
  - 很多 HTML Attribute 有对应的同名 DOM Property，例如 `id`
  - 有的 Attribute 和 Property 名字不一样，例如 `class` 和 `className`
  - `aria-*` 没有对应的 Property
  - 不是所有的 Property 都有对应的 Attribute，例如 `textContent`
  - 某些 Attribute 和 Property 之间互相关联，更新一个另一个也会变化，例如 `id`
  - 其他则是 Attribute 作为 Property 的初始值，例如 `value`
- 正确地设置元素属性
  - 优先设置 DOM Property
  - 如果是 bool 类型的属性，要特别处理，例如 `disabled`，此时空字符串也意味着 true
  - 某些 Property 是只读的，例如 `input.form`，只能通过 Attribute 来设置
- class 的处理
  - Vue 对 class 属性做了增强，支持多种方式来设置 class
  - 浏览器中对一个元素设置 class 有三种方式：`el.className`, `setAttribute`, `el.classList`
- 卸载
  - 使用 `innerHTML = ""` 来清空容器有如下缺陷
    - 组件的 `beforeUnmount` 和 `unmounted` 钩子不会被调用
    - 自定义指令的相关钩子不会被调用
    - DOM元素的事件处理器没有被移除
  - 正确做法：根据 vnode 获取到 DOM 然后使用 DOM 操作 `vnode.el.parentNode.removeChild(vnode.el)`
- 事件的处理
  - 事件是一种特殊的属性，可以约定，在 `vnode.props` 中，凡是以 `on` 开头的属性，都认为是事件
  - DOM 中绑定的事件处理器是一个伪造的处理器，在这个处理器内容调用真实的处理器
    - 这样做相当于增加了一个 layer，可以提高性能，避免反复创建创建监听器和卸载监听器，还可以解决其他问题，例如下文的【事件冒泡和更新时机的问题】
    - 可以通过 `el._vei` 获取到这个伪造的处理器
      - vei: Vue Event Invoker
    - 事件冒泡与更新时机
      - 无法知道事件冒泡是否完成，以及完成到什么程度
      - 点击事件 -> 触发子元素事件处理器 -> 更新渲染，父元素绑定事件处理器 -> 事件冒泡到父元素 -> 父元素的事件处理器执行
        - 这是不符合预期的结果
        - 即便将更新放在微任务队列里也不行
        - 利用时间来解决：屏蔽所有绑定时间晚于触发时间的处理器的执行
        - 这里注意使用高精度时间
        - 时间解决了处理器从无到有的问题，但是处理器更新的情况下，还是会调用更新后的处理器，下面的例子，点击的时候会 alert 111
          ```js
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <script src="https://cdnjs.cloudflare.com/ajax/libs/vue/3.3.4/vue.global.prod.min.js"></script>
            </head>
            <body>
              <div id="app"></div>

              <script>
                const { ref, effect, h } = Vue
                Vue.createApp({
                  setup() {
                    const bol = ref(false)
                    return { bol }
                  },
                  render() {
                    console.log("renderer")
                    window.cj = this
                    return h(
                      "div",
                      { onClick: this.bol ? () => alert(111) : () => alert(222) },
                      [
                        h(
                          "p",
                          {
                            onClick: (evt) => {
                              this.bol = true
                            },
                          },
                          "text"
                        ),
                      ]
                    )
                  },
                }).mount("#app")
              </script>
            </body>
          </html>
          ```
 - 更新子节点
  - 元素的子节点只有三种情况
    - 没有子节点
    - 有文本子节点
    - 子节点是数组
  - 子节点更新时，一共 3*3 九种可能性
- 文本节点和注释节点
  - `vnode.type` 是字符串，无法很好的表达文本节点和注释节点
  - 使用 `Symbol()` 来创建唯一标识符来表示文本节点和注释节点
- Fragment
