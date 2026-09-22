import React from 'react'

// Small click-to-open dropdown styled for the 200px popup. Mirrors the
// frontend `CartSelectorDropDownButton` flow (selected label, expanding list,
// click-to-select) but kept slim — no search bar, no inline create. Cart
// management lives in the Fomo Player web app.
//
// This replaces a native `<select>`, so it has to re-implement the keyboard
// behaviour the browser used to provide: Up/Down to move, Home/End to jump,
// Enter to pick, Escape to dismiss. The list is a listbox with
// `aria-activedescendant` — focus stays on the <ul> and the "active" option is
// pointed at by id, which keeps one tab stop instead of one per cart.

let listboxSeq = 0

export default class CartDropdown extends React.Component {
  constructor(props) {
    super(props)
    this.state = { open: false, activeIndex: -1 }
    this.toggle = this.toggle.bind(this)
    this.close = this.close.bind(this)
    this.handleDocClick = this.handleDocClick.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.rootRef = React.createRef()
    this.listRef = React.createRef()
    this.toggleRef = React.createRef()
    this.listboxId = `fp-dropdown-listbox-${(listboxSeq += 1)}`
  }

  componentDidMount() {
    document.addEventListener('mousedown', this.handleDocClick)
  }

  componentWillUnmount() {
    document.removeEventListener('mousedown', this.handleDocClick)
  }

  componentDidUpdate(prevProps, prevState) {
    // Move real focus onto the list when it opens so the keydown handler
    // receives keys, and back to the toggle when it closes.
    if (!prevState.open && this.state.open && this.listRef.current) {
      this.listRef.current.focus()
    } else if (prevState.open && !this.state.open && this.toggleRef.current) {
      this.toggleRef.current.focus()
    }
  }

  handleDocClick(e) {
    if (!this.state.open) return
    if (this.rootRef.current && this.rootRef.current.contains(e.target)) return
    this.close()
  }

  carts() {
    return this.props.carts || []
  }

  selectedIndex() {
    return this.carts().findIndex((c) => String(c.id) === String(this.props.selectedCartId))
  }

  optionId(index) {
    return `${this.listboxId}-option-${index}`
  }

  open() {
    if (this.props.disabled) return
    const selected = this.selectedIndex()
    this.setState({ open: true, activeIndex: selected >= 0 ? selected : 0 })
  }

  toggle() {
    if (this.props.disabled) return
    if (this.state.open) this.close()
    else this.open()
  }

  close() {
    this.setState({ open: false, activeIndex: -1 })
  }

  moveActive(delta) {
    const count = this.carts().length
    if (count === 0) return
    this.setState((s) => {
      const from = s.activeIndex < 0 ? 0 : s.activeIndex
      // Clamp rather than wrap: a 200px popup list is short enough that
      // wrapping past the end reads as a glitch.
      const next = Math.min(count - 1, Math.max(0, from + delta))
      return { activeIndex: next }
    })
  }

  setActive(index) {
    this.setState({ activeIndex: index })
  }

  selectCart(cartId) {
    this.props.onChange(String(cartId))
    this.close()
  }

  handleKeyDown(e) {
    const { open, activeIndex } = this.state
    const carts = this.carts()

    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        this.open()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        this.moveActive(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        this.moveActive(-1)
        break
      case 'Home':
        e.preventDefault()
        this.setActive(0)
        break
      case 'End':
        e.preventDefault()
        this.setActive(Math.max(0, carts.length - 1))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (carts[activeIndex]) this.selectCart(carts[activeIndex].id)
        break
      case 'Escape':
        e.preventDefault()
        this.close()
        break
      case 'Tab':
        // Let focus leave naturally, but don't leave an orphaned open list.
        this.close()
        break
      default:
        break
    }
  }

  render() {
    const { selectedCartId, disabled, placeholder = '— pick a cart —' } = this.props
    const { open, activeIndex } = this.state
    const carts = this.carts()
    const selected = carts.find((c) => String(c.id) === String(selectedCartId))
    const label = selected ? selected.name : placeholder

    return (
      <div className="fp-dropdown" ref={this.rootRef} onKeyDown={this.handleKeyDown}>
        <button
          type="button"
          className="fp-dropdown__toggle"
          onClick={this.toggle}
          disabled={disabled}
          ref={this.toggleRef}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? this.listboxId : undefined}
        >
          <span className="fp-dropdown__label" title={label}>
            {label}
          </span>
          <span className="fp-dropdown__caret" aria-hidden="true">
            {open ? '▴' : '▾'}
          </span>
        </button>
        {open && (
          <ul
            className="fp-dropdown__list"
            role="listbox"
            id={this.listboxId}
            ref={this.listRef}
            tabIndex={-1}
            aria-activedescendant={carts[activeIndex] ? this.optionId(activeIndex) : undefined}
          >
            {carts.length === 0 ? (
              <li className="fp-dropdown__empty">No carts available</li>
            ) : (
              carts.map((cart, index) => {
                const isSelected = String(cart.id) === String(selectedCartId)
                const isActive = index === activeIndex
                return (
                  <li
                    key={cart.id}
                    id={this.optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    className={
                      'fp-dropdown__item' +
                      (isSelected ? ' fp-dropdown__item--selected' : '') +
                      (isActive ? ' fp-dropdown__item--active' : '')
                    }
                    onClick={() => this.selectCart(cart.id)}
                    onMouseEnter={() => this.setActive(index)}
                  >
                    <span className="fp-dropdown__check" aria-hidden="true">
                      {isSelected ? '●' : '○'}
                    </span>
                    <span className="fp-dropdown__item-name">
                      {cart.name}
                      {cart.is_default ? ' (default)' : ''}
                    </span>
                  </li>
                )
              })
            )}
          </ul>
        )}
      </div>
    )
  }
}
