import { lis } from "./utils.js"
import { reactive, effect } from "./proxy.js"

// el.form 是只读的，只能通过 attribute 来设置
function shouldSetAsProp(el, key, value) {
  if (key === "form" && el.tagName === "INPUT") return false
  return key in el
}

const isArray = (x) => Array.isArray(x)

const DOMApis = {
  firstChild(el) {
    return el.firstChild
  },
  nextSibling(el) {
    return el.nextSibling
  },
  createText(content) {
    return document.createTextNode(content)
  },
  setText(el, text) {
    el.nodeValue = text
  },
  createElement(tag) {
    // console.log("[DOM] create")
    return document.createElement(tag)
  },
  removeChild(parent, child) {
    // console.log("[DOM] remove")
    parent.removeChild(child)
  },
  setElementText(el, text) {
    el.innerText = text
  },
  insertBefore(el, parent, anchor = null) {
    parent.insertBefore(el, anchor)
  },
  patchProp(el, key, prevValue, nextValue) {
    if (/^on/.test(key)) {
      const invokers = el._vei || (el._vei = {})
      let invoker = invokers[key]
      const name = key.slice(2).toLowerCase()
      if (nextValue) {
        if (!invoker) {
          invoker = el._vei[key] = (evt) => {
            // 事件触发时间早于处理器绑定时间
            if (evt.timestamp < invoker.attached) return

            if (isArray(invoker.value)) {
              invoker.value.forEach((fn) => fn(evt))
            } else {
              invoker.value(evt)
            }
          }
          invoker.value = nextValue
          invoker.attached = performance.now()
          el.addEventListener(name, invoker)
        } else {
          invoker.value = nextValue
        }
      } else if (invoker) {
        el.removeEventListener(name, invoker)
      }
    } else if (key === "class") {
      el.className = nextValue || ""
    } else if (shouldSetAsProp(el, key, value)) {
      const type = typeof el[key]

      if (type === "boolean" && nextValue === "") {
        el[key] = true
      } else {
        el[key] = nextValue
      }
    } else {
      el.setAttribute(key, nextValue)
    }
  },
}

const Text = Symbol()
const Comment = Symbol()
const Fragment = Symbol()

function sameKey(n1, n2) {
  return n1?.key && n2?.key && n1.key === n2.key
}

export function createRenderer(apis = DOMApis) {
  const {
    createElement,
    setElementText,
    patchProp,
    createText: createText,
    removeChild,
    nextSibling,
    firstChild,
    insertBefore,
  } = apis

  // anchor: insertBefore anchor
  // n1: old, n2: new
  function patch(n1, n2, container, anchor) {
    if (n1 && n1.type !== n2.type) {
      anchor = nextSibling(n1.el)
      unmount(n1)
      n1 = null
    }

    const { type } = n2
    if (typeof type === "string") {
      if (!n1) {
        mountElement(n2, container, anchor)
      } else {
        patchElement(n1, n2)
      }
    } else if (type === Text) {
      if (!n1) {
        const el = (n2.el = createText(n2.children))
        insertBefore(el, container)
      } else {
        const el = (n2.el = n1.el)
        if (n2.children !== n1.children) {
          setText(el, n2.children)
        }
      }
    } else if (type === Fragment) {
      if (!n1) {
        n2.children.forEach((c) => patch(null, c, container))
      } else {
        patchChildren(n1, n2, container)
      }
    } else if (typeof type === "object") {
      if (!n1) {
        mountComponent(n2, container, anchor)
      } else {
        patchComponent(n1, n2, anchor)
      }
    }
  }

  const queue = new Set()
  let isFlushing = false
  const p = Promise.resolve()

  function queueJob(job) {
    queue.add(job)
    if (!isFlushing) {
      isFlushing = true

      p.then(() => {
        try {
          queue.forEach((job) => job())
        } finally {
          isFlushing = false
          queue.clear()
        }
      })
    }
  }

  function mountComponent(vnode, container, anchor) {
    const componentOptions = vnode.type
    const {
      render,
      data,
      beforeCreate,
      created,
      beforeMount,
      mounted,
      beforeUpdate,
      updated,
    } = componentOptions

    beforeCreate && beforeCreate()

    const state = reactive(data ? data() : {})

    const instance = {
      state,
      isMounted: false,
      subTree: null,
    }
    vnode.component = instance

    created && created.call(state)

    effect(
      () => {
        const subTree = render.call(state)

        if (!instance.isMounted) {
          beforeMount && beforeMount.call(state)
          patch(null, subTree, container, anchor)
          instance.isMounted = true
          mounted && mounted.call(state)
        } else {
          beforeUpdate && beforeUpdate.call(state)
          patch(instance.subTree, subTree, container, anchor)
          updated && updated.call(state)
        }

        instance.subTree = subTree
        vnode.el = subTree.el
      },
      {
        scheduler: queueJob,
      }
    )
  }

  function patchElement(n1, n2) {
    const el = (n2.el = n1.el)
    const oldProps = n1.props
    const newProps = n2.props

    for (const key in newProps) {
      if (newProps[key] !== oldProps[key]) {
        patchProp(el, key, oldProps[key], newProps[key])
      }
    }

    for (const key in oldProps) {
      if (!(key in newProps)) {
        patchProp(el, key, oldProps[key], null)
      }
    }

    patchChildren(n1, n2, el)
  }

  // 子节点只有三种情况
  // 1. 没有子节点
  // 2. 文本子节点
  // 3. 一组子节点
  function patchChildren(n1, n2, container) {
    // 新节点是文本
    if (typeof n2.children === "string") {
      // 旧节点是一组节点
      if (isArray(n1.children)) {
        n1.children.forEach((c) => unmount(c))
      }

      setElementText(container, n2.children)
      // 新节点是一组子节点
    } else if (isArray(n2.children)) {
      // NOTE: core diff algorithm
      if (isArray(n1.children)) {
        // naive diff 旧的全部卸载，新的全部挂载
        // naiveDiff(n1, n2, container)

        // simple diff 按顺序比较
        // simpleDiff(n1, n2, container)

        // keyed diff 根据 key 判断新旧节点的对应关系
        // keyedDiff(n1, n2, container)

        // two-way keyed diff
        // twoWayDiff(n1, n2, container)

        quickDiff(n1, n2, container)
      } else {
        setElementText(container, "")
        n2.children.forEach((c) => patch(null, c, container))
      }
      // 新子节点不存在
    } else {
      if (isArray(n1.children)) {
        n1.children.forEach((c) => unmount(c))
      } else if (typeof n1.children === "string") {
        setElementText(container, "")
      }
    }
  }

  function render(vnode, container) {
    if (vnode) {
      patch(container._vnode, vnode, container)
    } else {
      if (container._vnode) {
        unmount(container._vnode)
      }
    }

    container._vnode = vnode
  }

  function mountElement(vnode, container, anchor) {
    const el = (vnode.el = createElement(vnode.type))

    if (typeof vnode.children === "string") {
      setElementText(el, vnode.children)
    } else if (isArray(vnode.children)) {
      vnode.children.forEach((child) => {
        patch(null, child, el)
      })
    }

    if (vnode.props) {
      for (const key in vnode.props) {
        patchProp(el, key, null, vnode.props[key])
      }
    }

    insertBefore(el, container, anchor)
  }

  function unmount(vnode) {
    if (vnode.type === Fragment) {
      vnode.children.forEach((c) => unmount(c))
      return
    }

    const parent = vnode.el.parentNode
    if (parent) {
      removeChild(parent, vnode.el)
    }
  }

  return { render }

  function naiveDiff(n1, n2, container) {
    n1.children.forEach((c) => unmount(c))
    n2.children.forEach((c) => patch(null, c, container))
  }

  function simpleDiff(n1, n2, container) {
    const oldChildren = n1.children
    const newChildren = n2.children

    const oldLen = oldChildren.length
    const newLen = newChildren.length

    const commonLen = Math.min(oldLen, newLen)

    for (let i = 0; i < commonLen; i++) {
      patch(oldChildren[i], newChildren[i], container)
    }

    // 新的节点需要挂载
    if (newLen > oldLen) {
      for (let i = commonLen; i < newLen; i++) {
        patch(null, newChildren[i], container)
      }
      // 多余的节点需要卸载
    } else if (oldLen > newLen) {
      for (let i = commonLen; i < oldLen; i++) {
        unmount(oldChildren[i])
      }
    }
  }

  function keyedDiff(n1, n2, container) {
    const oldChildren = n1.children
    const newChildren = n2.children

    let lastIndex = 0
    for (let i = 0; i < newChildren.length; i++) {
      const newNode = newChildren[i]

      let find = false
      for (let j = 0; j < oldChildren.length; j++) {
        const oldNode = oldChildren[j]
        if (sameKey(oldNode, newNode)) {
          find = true
          patch(oldNode, newNode, container)
          if (j < lastIndex) {
            // 当前节点在 oldChildren 中的索引值小于最大索引值
            // 意味着当前节点需要移动
            const prevNode = newChildren[i - 1]
            const anchor = nextSibling(prevNode.el)
            insertBefore(newNode.el, container, anchor)
          } else {
            lastIndex = j
          }
        }
      }

      if (!find) {
        const prevNode = newChildren[i - 1]
        let anchor = null
        if (prevNode) {
          anchor = nextSibling(prevNode.el)
        } else {
          anchor = firstChild(container)
        }

        patch(null, newNode, container, anchor)
      }
    }

    // 移除多余的元素
    for (const oldNode of oldChildren) {
      const has = newChildren.find((newNode) => sameKey(oldNode, newNode))
      if (!has) {
        unmount(oldNode)
      }
    }
  }

  function twoWayDiff(n1, n2, container) {
    const oldChildren = n1.children
    const newChildren = n2.children

    let oldStartIdx = 0
    let oldEndIdx = oldChildren.length - 1
    let newStartIdx = 0
    let newEndIdx = newChildren.length - 1

    let oldStartVNode = oldChildren[oldStartIdx]
    let oldEndVNode = oldChildren[oldEndIdx]
    let newStartVNode = newChildren[newStartIdx]
    let newEndVNode = newChildren[newEndIdx]

    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      // undefined 表示已经处理过了
      if (oldStartVNode === undefined) {
        oldStartVNode = oldChildren[++oldStartIdx]
      } else if (oldEndVNode === undefined) {
        oldEndVNode = oldChildren[--oldEndIdx]
      } else if (sameKey(oldStartVNode, newStartVNode)) {
        patch(oldStartVNode, newStartVNode, container)
        oldStartVNode = oldChildren[++oldStartIdx]
        newStartVNode = newChildren[++newStartIdx]
      } else if (sameKey(oldEndVNode, newEndVNode)) {
        patch(oldEndVNode, newEndVNode, container)
        oldEndVNode = oldChildren[--oldEndIdx]
        newEndVNode = newChildren[--newEndIdx]
      } else if (sameKey(oldStartVNode, newEndVNode)) {
        patch(oldStartVNode, newEndVNode)
        insertBefore(oldStartVNode.el, container, oldEndVNode.el.nextSibling)
        oldStartVNode = oldChildren[++oldStartIdx]
        newEndVNode = newChildren[--newEndIdx]
      } else if (sameKey(oldEndVNode, newStartVNode)) {
        patch(oldEndVNode, newStartVNode, container)
        insertBefore(oldEndVNode.el, container, oldStartVNode.el)

        oldEndVNode = oldChildren[--oldEndIdx]
        newStartVNode = newChildren[++newStartIdx]
      } else {
        // 四种情况都没有命中
        const idxInOld = oldChildren.findIndex((n) => sameKey(n, newStartVNode))
        if (idxInOld > 0) {
          const vnodeToMove = oldChildren[idxInOld]
          patch(vnodeToMove, newStartVNode, container)
          insertBefore(vnodeToMove.el, container, oldStartVNode.el)
          oldChildren[idxInOld] = undefined
        } else {
          patch(null, newStartVNode, container, oldStartVNode.el)
        }

        newStartVNode = newChildren[++newStartIdx]
      }
    }

    // 挂载新元素
    if (oldEndIdx < oldStartIdx && newStartIdx <= newEndIdx) {
      for (let i = newStartIdx; i <= newEndIdx; i++) {
        // TODO: 使用 oldStartVnode.el 作为 anchor 是否可行？
        const anchor = newChildren[newEndIdx + 1]
          ? newChildren[newEndIdx + 1].el
          : null
        patch(null, newChildren[i], container, anchor)
      }
    }

    // 卸载多余元素
    if (newEndIdx < newStartIdx && oldStartIdx <= oldEndIdx) {
      for (let i = oldStartIdx; i <= oldEndIdx; i++) {
        unmount(oldChildren[i])
      }
    }
  }

  function quickDiff(n1, n2, container) {
    const oldChildren = n1.children
    const newChildren = n2.children

    // 处理相同的前置节点
    let j = 0
    let oldVNode = oldChildren[j]
    let newVNode = newChildren[j]
    while (sameKey(oldVNode, newVNode)) {
      patch(oldVNode, newVNode, container)
      j++
      oldVNode = oldChildren[j]
      newVNode = newChildren[j]
    }

    // 处理相同的后置节点
    let oldEnd = oldChildren.length - 1
    let newEnd = newChildren.length - 1

    if (j < oldEnd && j < newEnd) {
      oldVNode = oldChildren[oldEnd]
      newVNode = newChildren[newEnd]

      while (sameKey(oldVNode, newVNode)) {
        patch(oldVNode, newVNode, container)
        oldVNode = oldChildren[--oldEnd]
        newVNode = newChildren[--newEnd]
      }
    }

    // j > oldEnd: 在预处理过程中，旧节点都处理完毕了
    // j <= newEnd: 新的节点还有未处理的部分
    // j ~ newEnd 之间的节点是新节点，需要插入
    if (j > oldEnd && j <= newEnd) {
      const anchorIndex = newEnd + 1
      const anchor = newChildren[anchorIndex]?.el

      while (j <= newEnd) {
        patch(null, newChildren[j], container, anchor)
        j++
      }
      // 旧节点
    } else if (j > newEnd && j <= oldEnd) {
      while (j <= oldEnd) {
        unmount(oldChildren[j++])
      }
    } else {
      const count = newEnd - j + 1

      // 存储新的子节点在旧的子节点中的位置索引
      const sources = new Array(count).fill(-1)

      const oldStart = j
      const newStart = j
      let moved = false
      let pos = 0
      let patched = 0

      const keyIndex = {}
      for (let i = newStart; i <= newEnd; i++) {
        keyIndex[newChildren[i].key] = i
      }

      for (let i = oldStart; i <= oldEnd; i++) {
        oldVNode = oldChildren[i]
        if (patched <= count) {
          const k = keyIndex[oldVNode.key]

          if (k !== undefined) {
            newVNode = newChildren[k]
            patch(oldVNode, newVNode, container)
            patched++
            sources[k - newStart] = i
            if (k < pos) {
              moved = true
            } else {
              pos = k
            }
          } else {
            unmount(oldVNode)
          }
        } else {
          unmount(oldVNode)
        }
      }

      // 有节点需要移动
      if (moved) {
        // 注意，这里返回的是 sources 的索引
        const seq = lis(sources)

        let s = seq.length - 1
        let i = count - 1
        for (i; i >= 0; i--) {
          if (sources[i] === -1) {
            // 全新节点，需要挂载
            const pos = i + newStart
            const newVNode = newChildren[pos]
            const anchor = newChildren[pos + 1]?.el || null
            patch(null, newVNode, container, anchor)
          } else if (i !== seq[s]) {
            // 节点需要移动
            const pos = i + newStart
            const newVNode = newChildren[pos]
            const anchor = newChildren[pos + 1]?.el || null
            insertBefore(newVNode.el, container, anchor)
          } else {
            s--
          }
        }
      } else {
        for (let k = sources.length - 1; k >= 0; k--) {
          if (sources[k] === -1) {
            // mount
            const newVNode = newChildren[newStart + k]
            const anchor = newChildren[newStart + k + 1]?.el
            patch(null, newVNode, container, anchor)
          }
        }
      }
    }
  }
}
