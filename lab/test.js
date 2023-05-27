import {
  effect,
  watch,
  computed,
  reactive,
  shallowReactive,
  readonly,
  shallowReadonly,
  bucket,
} from "./proxy.js"
// import { effect, watch, computed, reactive } from "vue"

// const obj = reactive({ foo: { bar: 1 } })
const obj = {}
const raw = [obj]
const arr = reactive(raw)

effect(() => {
  console.log("=== track ==")

  console.log(arr.includes(1))
})

// console.log(bucket.get(raw))

arr.push(1)

// // obj[0] = "foo"

// obj.length = 3

// obj.foo = { bar: 3 }
