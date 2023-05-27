export const bucket = new WeakMap()

const ITERATE_KEY = Symbol()
const RAW_KEY = Symbol()

function hasOwnProperty(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key)
}

const arrayInstrumentations = {}

;[("includes", "indexOf", "lastIndexOf")].forEach((method) => {
  const originMethod = Array.prototype[method]

  arrayInstrumentations[method] = function (...args) {
    let res = originMethod.apply(this, args)

    if (res === false) {
      res = originMethod.apply(this[RAW_KEY], args)
    }

    return res
  }
})

function createReactive(target, isShalow = false, isReadonly = false) {
  return new Proxy(target, {
    get(target, key, receiver) {
      if (key === RAW_KEY) {
        return target
      }

      if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
        return Reflect.get(arrayInstrumentations, key, receiver)
      }

      if (!isReadonly && typeof key !== "symbol") {
        track(target, key)
      }

      const res = Reflect.get(target, key, receiver)
      if (isShalow) {
        return res
      }

      if (typeof res === "object" && res != null) {
        return isReadonly ? readonly(res) : reactive(res)
      }

      return res
    },

    set(target, key, value, receiver) {
      if (isReadonly) {
        console.warn(`${key} is readonly`)
        return true
      }

      const oldValue = target[key]

      const type = Array.isArray(target)
        ? // TODO: Number(key) 不是很全面
          Number(key) < target.length
          ? TriggerType.SET
          : TriggerType.ADD
        : hasOwnProperty(target, key)
        ? TriggerType.SET
        : TriggerType.ADD
      const res = Reflect.set(target, key, value, receiver)

      if (target === receiver[RAW_KEY]) {
        if (oldValue !== value && (oldValue === oldValue || value === value)) {
          trigger(target, key, type, value)
        }
      }

      return res
    },

    has(target, key) {
      track(target, key)
      return Reflect.has(target, key)
    },

    ownKeys(target) {
      track(target, Array.isArray(target) ? "length" : ITERATE_KEY)
      return Reflect.ownKeys(target)
    },

    deleteProperty(target, key) {
      if (isReadonly) {
        console.warn(`${key} is readonly`)
        return true
      }

      const hasKey = hasOwnProperty(target, key)
      const res = Reflect.deleteProperty(target, key)

      console.log({ hasKey, res })

      if (hasKey && res) {
        trigger(target, key, TriggerType.DELETE)
      }

      return res
    },
  })
}

const reactiveMap = new Map()
export function reactive(obj) {
  const cache = reactiveMap.get(obj)
  if (cache) return cache

  const result = createReactive(obj, false)
  reactiveMap.set(obj, result)

  return result
}

export function shallowReactive(obj) {
  return createReactive(obj, true)
}

const readonlyMap = new Map()
export function readonly(obj) {
  const cache = readonlyMap.get(obj)
  if (cache) return cache

  const result = createReactive(obj, false, true)
  readonlyMap.set(obj, result)

  return result
}
export function shallowReadonly(obj) {
  return createReactive(obj, true, true)
}

function track(target, key) {
  if (!activeEffect) return

  let depsMap = bucket.get(target)
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()))
  }

  let deps = depsMap.get(key)
  if (!deps) {
    depsMap.set(key, (deps = new Set()))
  }

  deps.add(activeEffect)
  activeEffect.deps.push(deps)
}

const TriggerType = {
  SET: "set",
  ADD: "add",
  DELETE: "delete",
}
function trigger(target, key, type, newVal) {
  const depsMap = bucket.get(target)
  if (!depsMap) return

  const effects = depsMap.get(key)

  const effectsToRun = new Set()

  effects &&
    effects.forEach((fn) => {
      if (fn !== activeEffect) {
        effectsToRun.add(fn)
      }
    })

  // for...in
  if (type === TriggerType.ADD || type === TriggerType.DELETE) {
    const iterateEffects = depsMap.get(ITERATE_KEY)
    iterateEffects &&
      iterateEffects.forEach((fn) => {
        if (fn !== activeEffect) {
          effectsToRun.add(fn)
        }
      })
  }

  // Array
  if (Array.isArray) {
    if (type === TriggerType.ADD) {
      const lengthEffects = depsMap.get("length")
      lengthEffects &&
        lengthEffects.forEach((fn) => {
          if (fn !== activeEffect) {
            effectsToRun.add(fn)
          }
        })
    }

    if (key === "length") {
      depsMap.forEach((effects, key) => {
        if (key >= newVal) {
          effects.forEach((fn) => {
            if (fn !== activeEffect) {
              effectsToRun.add(fn)
            }
          })
        }
      })
    }
  }

  effectsToRun.forEach((fn) => {
    if (fn.options.scheduler) {
      fn.options.scheduler(fn)
    } else {
      fn()
    }
  })
}

function cleanup(effectFn) {
  for (let i = 0; i < effectFn.deps.length; i++) {
    const deps = effectFn.deps[i]
    deps.delete(effectFn)
  }
  effectFn.deps.length = 0
}

let activeEffect
let effectStack = []

export function effect(fn, options = {}) {
  const effectFn = () => {
    cleanup(effectFn)
    activeEffect = effectFn
    effectStack.push(effectFn)
    const res = fn()
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]
    return res
  }

  effectFn.deps = []
  effectFn.options = options

  if (!options.lazy) {
    effectFn()
  }

  return effectFn
}

const jobQueue = new Set()
const p = Promise.resolve()

let isFlusing = false
function flushJob() {
  if (isFlusing) return

  isFlusing = true

  p.then(() => {
    jobQueue.forEach((job) => job())
  }).finally(() => {
    isFlusing = false
  })
}

export function computed(getter) {
  let value
  let dirty = true

  const effectFn = effect(getter, {
    lazy: true,
    scheduler() {
      if (!dirty) {
        dirty = true
        trigger(obj, "value")
      }
    },
  })

  const obj = {
    get value() {
      if (dirty) {
        value = effectFn()
        dirty = false
      }
      track(obj, "value")
      return value
    },
  }

  return obj
}

function traverse(value, seen = new Set()) {
  if (typeof value !== "object" || value === null || seen.has(value)) return
  seen.add(value)

  for (const k in value) {
    traverse(value[k], seen)
  }

  return value
}

export function watch(source, cb, options = {}) {
  let getter
  if (typeof source === "function") {
    getter = source
  } else {
    getter = () => traverse(source)
  }

  let oldValue, newValue, cleanup

  function onInvalidate(cb) {
    cleanup = cb
  }

  const job = () => {
    newValue = effectFn()
    if (cleanup) {
      cleanup()
    }
    cb(newValue, oldValue, onInvalidate)
    oldValue = newValue
  }

  const effectFn = effect(() => getter(), {
    lazy: true,
    scheduler: job,
  })

  if (options.immediate) {
    job()
  } else {
    oldValue = effectFn()
  }
}
