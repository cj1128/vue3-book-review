import {
  effect,
  watch,
  computed,
  reactive,
  shallowReactive,
  readonly,
  shallowReadonly,
  bucket,
  ref,
} from "./proxy.js"
// } from "vue"

const v = ref(1)

// console.log("====")
// console.log(s)
// console.log(obj.__proto__ === parent)

effect(() => {
  console.log("==== track ====")
  console.log(v.value)
})

v.value = 100

// console.log(bucket.get(obj), bucket.get(proto))

// child.bar = 2

// const p = reactive(new Map([["key1", "value1"]]))
// // const p = reactive(new Set([10,20,30]))

// effect(() => {
//   console.log("=== track ===")

//   // p.forEach(v => {
//   //   console.log(v)
//   // })

//   // const itr = p.entries()

//   for (const item of p.keys()) {
//     console.log(item)
//   }

//   // console.log(itr.next())
// })

// p.set("key2", "value2")

// // p.add(100)
