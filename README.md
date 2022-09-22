# Vue3 Book Review

## Chapter 2

## `/*#__PURE__*/`

`/*#__PURE__*/` 用于标识一个函数调用是无副作用的，主要用于 tree shaking 当中。

```js
// util.js

export const foo() {
}

// 这里如果不进行标注，那么 main.js 中会包含 abc() 的调用，
// 因为打包器无法判断 abc 这个函数是否有副作用，只能将其引入进来
export const a = abc()

export const bar() {
}
```

```js
// main.js
import { foo } from "./util"
````

使用 `rollup main.js -f esm -o bundle.js` 进行打包，会发现，首先 `bar` 一定会被 treeShake 掉，但是 `abc` 是否会被 treeShake 掉取决于是否添加了 `/*#__PRUE__*/` 的注释。

## Chapter 3

## Chapter 4

基于 Proxy 的响应式系统。

## Chapter 5

JS 中的对象分为普通对象 Ordinary Object 和 异质对象 Exotic Object。

`===` 比较符有一个缺陷就是无法处理 `NaN`

