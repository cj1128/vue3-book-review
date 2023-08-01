function shouldSetAsProps(el, key, value) {
  if (key === "form" && el.tagName === "INPUT") return true
  return false
}

const isArray = (x) => Array.isArray(x)

const DOMApis = {
  createText(content) {
    return document.createTextNode(content)
  },
  setText(el, text) {
    el.nodeValue = text
  },
  createElement(tag) {
    return document.createElement(tag)
  },
  setElementText(el, text) {
    el.innerText = text
  },
  insert(el, parent, anchor = null) {
    parent.insertBefore(el, anchor)
  },
  patchProps(el, key, prevValue, nextValue) {
    if (/^on/.test(key)) {
      const invokers = el._vei || (el._vei = {})
      let invoker = invokers[key]
      const name = key.slice(2).toLowerCase()
      if (nextValue) {
        if (!invoker) {
          invoker = el._vei[key] = (evt) => {
            // 事件触发时间早于处理器绑定时间
            if(evt.timestamp < invoker.attached) return

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
    } else if (shouldSetAsProps(el, key, value)) {
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
export function createRenderer(apis = DOMApis) {
  const { createElement, insert, setElementText, patchProps, createText } = apis

  function patch(n1, n2, container) {
    if (n1 && n1.type !== n2.type) {
      unmount(n1)
      n1 = null
    }

    const { type } = n2
    if (typeof type === "string") {
      if (!n1) {
        mountElement(n2, container)
      } else {
        patchElement(n1, n2)
      }
    } else if (type === Text) {
      if (!n1) {
        const el = (n2.el = createText(n2.children))
        insert(el, container)
      } else {
        const el = (n2.el = n1.el)
        if (n2.children !== n1.children) {
          setText(el, n2.children)
        }
      }
    } else if (typeof type === "object") {
      // TODO: Component
    }
  }

  function patchElement(n1, n2) {
    const el = (n2.el = n1.el)
    const oldProps = n1.props
    const newProps = n2.props

    for (const key in newProps) {
      if (newProps[key] !== oldProps[key]) {
        patchProps(el, key, oldProps[key], newProps[key])
      }
    }

    for (const key in oldProps) {
      if (!(key in newProps)) {
        patchProps(el, key, oldProps[key], null)
      }
    }

    patchChildren(n1, n2, el)
  }

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
      if (isArray(n1.children)) {
        // TODO: diff
        n1.children.forEach((c) => unmount(c))
        n2.children.forEach((c) => patch(null, c, container))
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

  function mountElement(vnode, container) {
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
        patchProps(el, key, null, vnode.props[key])
      }
    }

    insert(el, container)
  }

  function unmount(vnode) {
    const parent = vnode.el.parentNode
    if (parent) {
      parent.removeChild(vnode.el)
    }
  }

  return { render }
}
