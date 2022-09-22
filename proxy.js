const bucket = new WeakMap()

function makeProxy(target) {
  return new Proxy(target, {
    get(target, key) {
      track(target, key)
      return target[key]
    },

    set(target, key, value) {
      if(target[key] === value) return
      target[key] = value
      trigger(target, key)
    }
  })
}

function track(target, key) {
  if(!activeEffect) return

  let depsMap = bucket.get(target)
  if(!depsMap) {
    bucket.set(target, (depsMap = new Map()))
  }

  let deps = depsMap.get(key)
  if(!deps) {
    depsMap.set(key, (deps = new Set()))
  }

  deps.add(activeEffect)
  activeEffect.deps.push(deps)
}

function trigger(target, key) {
  const depsMap = bucket.get(target)
  if(!depsMap) return

  const effects = depsMap.get(key)
  const effectsToRun = new Set()

  effects && effects.forEach(effect => {
    if(effect !== activeEffect) {
      effectsToRun.add(effect)
    }
  })

  effectsToRun.forEach(fn => {
    if(fn.options.scheduler) {
      fn.options.scheduler(fn)
    } else {
      fn()
    }
  })
}

function cleanup(effectFn) {
  for(let i = 0; i < effectFn.deps.length; i++) {
    const deps = effectFn.deps[i]
    deps.delete(effectFn)
  }
  effectFn.deps.length = 0
}

let activeEffect
let effectStack = []

function effect(fn, options={}) {
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

  if(!options.lazy) {
    effectFn()
  }

  return effectFn
}

const jobQueue = new Set()
const p = Promise.resolve()

let isFlusing = false
function flushJob() {
  if(isFlusing) return

  isFlusing = true

  p.then(() => {
    jobQueue.forEach(job => job())
  }).finally(() => {
    isFlusing = false
  })
}

function computed(getter) {
  let value
  let dirty = true

  const effectFn = effect(getter, {
    lazy: true,
    scheduler()  {
      if(!dirty) {
        dirty = true
        trigger(obj, 'value')
      }
    },
  })

  const obj = {
    get value() {
      if(dirty) {
        value = effectFn()
        dirty = false
      }
      track(obj, 'value')
      return value
    }
  }

  return obj
}

function traverse(value, seen = new Set()) {
  if(typeof value !== 'object' || value === null || seen.has(value)) return
  seen.add(value)

  for(const k in value) {
    traverse(value[k], seen)
  }

  return value
}

function watch(source, cb, options={}) {
  let getter
  if(typeof source === 'function') {
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
    if(cleanup) {
      cleanup()
    }
    cb(newValue, oldValue, onInvalidate)
    oldValue = newValue
  }

  const effectFn = effect(() => getter(), {
    lazy: true,
    scheduler: job,
  })

  if(options.immediate) {
    job()
  } else {
    oldValue = effectFn()
  }
}

let tmp = 500

const fetchSomething = (val, ms = 100) => new Promise(resovle => {
  setTimeout(() => {
    resovle(val + "!!final!!")
  }, ms)
})

const data = makeProxy({foo: 1, bar : 2})

watch(() => data.foo, async (newValue, oldValue, onInvalidate) => {
  let expired = false

  onInvalidate(() => {
    expired = true
  })

  tmp -= 200
  const res = await fetchSomething(newValue, tmp)

  if(!expired) {
    console.log("received final data", res)
  }
})

data.foo = 2
data.foo = 3



