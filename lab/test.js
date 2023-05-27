import {
  effect,
  watch,
  computed,
  reactive,
  shallowReactive,
  readonly,
  shallowReadonly,
  // bucket,
} from "./proxy.js"
// } from "vue"

const p = reactive(new Map([["key1", "value1"]]))

effect(() => {
  console.log("=== track ===")
  const itr = p.entries()

  for (const item of itr) {
    console.log(item)
  }

  // console.log(itr.next())
})

p.set("key2", "value2")

// p.push(100)
