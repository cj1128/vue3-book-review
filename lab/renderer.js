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
    console.log("[DOM] create")
    return document.createElement(tag)
  },
  removeChild(parent, child) {
    console.log("[DOM] remove")
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
  return n1.type === n2.type && n1.key && n2.key && n1.key === n2.key
}

export function createRenderer(apis = DOMApis) {
  const {
    createElement,
    setElementText,
    patchProp,
    createText,
    removeChild,
    nextSibling,
    firstChild,
    insertBefore,
  } = apis

  function patch(n1, n2, container, anchor) {
    if (n1 && n1.type !== n2.type) {
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
      // TODO: Component
    }
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
        // NOTE: simple diff
        const oldChildren = n1.children
        const newChildren = n2.children

        // simple diff
        // {
        //   const oldLen = oldChildren.length
        //   const newLen = newChildren.length

        //   const commonLen = Math.min(oldLen, newLen)

        //   for (let i = 0; i < commonLen; i++) {
        //     patch(oldChildren[i], newChildren[i], container)
        //   }

        //   // 新的节点需要挂载
        //   if (newLen > oldLen) {
        //     for (let i = commonLen; i < newLen; i++) {
        //       patch(null, newChildren[i], container)
        //     }
        //     // 多余的节点需要卸载
        //   } else if (oldLen > newLen) {
        //     for (let i = commonLen; i < oldLen; i++) {
        //       unmount(oldChildren[i])
        //     }
        //   }
        // }

        // use key
        {
          let lastIndex = 0
          for (let i = 0; i < newChildren.length; i++) {
            const newNode = newChildren[i]

            let find = false
            for (let j = 0; j < oldChildren.length; j++) {
              const oldNode = oldChildren[j]
              if (sameKey(oldNode, newNode)) {
                find = true
                console.log("!!! patch")
                patch(oldNode, newNode, container)
                if (j < lastIndex) {
                  // 当前节点在 oldChildren 中的索引值小于最大索引值
                  // 意味着当前节点需要移动
                  const prevNode = newChildren[i - 1]
                  if (prevNode) {
                    const anchor = nextSibling(prevNode.el)
                    insertBefore(newNode.el, container, anchor)
                  }
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

            // 移除多余的元素
            for (const oldNode of oldChildren) {
              const has = newChildren.find((newNode) =>
                sameKey(oldNode, newNode)
              )
              if (!has) {
                unmount(oldNode)
              }
            }
          }
        }
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
}
