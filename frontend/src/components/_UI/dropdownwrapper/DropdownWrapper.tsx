import React, { useRef, useEffect, useLayoutEffect, useState } from "react";
import styles from "./DropdownWrapper.module.scss";

type DropdownWrapperProps = {
  wrapperClassName?: string;
  buttonClassName?: string;
  left?: boolean;
  right?: boolean;
  profile?: boolean;
  noti?: boolean;
  middle?: boolean;
  middleleft?: boolean;
  middleleftTop?: boolean;
  up?: boolean;
  upDel?: boolean;
  fixed?: boolean;
  minWidthPx?: number;
  menuClassName?: string;
  children: [React.ReactNode, React.ReactNode];
  closeOnClick?: boolean;
  isOpen?: boolean; // управляемое состояние
  onClose?: () => void; // callback для закрытия
};

const DropdownWrapper: React.FC<DropdownWrapperProps> = ({
  wrapperClassName,
  buttonClassName,
  left,
  right,
  middle,
  middleleft,
  middleleftTop,
  profile,
  noti,
  up,
  upDel,
  fixed,
  minWidthPx,
  menuClassName,
  children,
  closeOnClick = true,
  isOpen: controlledOpen,
  onClose,
}) => {
  const [button, dropdown] = children;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [internalOpen, setInternalOpen] = useState(false);

  // используем управляемое состояние, если оно передано
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const toggleDropdown = () => {
    if (controlledOpen !== undefined) {
      if (controlledOpen) onClose?.();
      return;
    }
    setInternalOpen(prev => !prev);
  };

  const handleDropdownClick = (event: React.MouseEvent) => {
    if (!closeOnClick) event.stopPropagation();
  };

  const handleItemClick = (event: React.MouseEvent, child: React.ReactNode) => {
    const shouldProxyItemClick = middleleft || middleleftTop || up || upDel || fixed;
    if (
      shouldProxyItemClick &&
      event.target === event.currentTarget &&
      React.isValidElement(child) &&
      typeof (child.props as { onClick?: unknown }).onClick === "function"
    ) {
      (child.props as { onClick: (e: React.MouseEvent) => void }).onClick(event);
    }

    if (closeOnClick) {
      if (controlledOpen !== undefined) onClose?.();
      else setInternalOpen(false);
    }
  };

  const positionClass = [
    profile ? styles.profile : "",
    noti ? styles.noti : "",
    !fixed && !profile && !noti
      ? left
        ? styles.left
        : right
          ? styles.right
          : middle
            ? styles.middle
            : styles.middle
      : "",
    !fixed && middleleft ? styles.middleleft : "",
    !fixed && middleleftTop ? styles.middleleftTop : "",
    !fixed && (up || upDel) ? styles.up : "",
    !fixed && upDel ? styles.upDel : "",
    fixed ? styles.fixed : "",
  ].filter(Boolean).join(" ");

  const updatePosition = () => {
    const wrapper = wrapperRef.current;
    const menu = dropdownRef.current;
    if (!wrapper || !menu) return;

    if (profile) {
      // Profile dropdown: always pinned to the right edge of the screen.
      // Tweak the offset in DevTools via the --dropdown-profile-right-offset custom property.
      setMenuStyle({
        right: "calc(0px - var(--dropdown-profile-right-offset, 31px))",
        left: "auto",
        transform: "none"
      });
      return;
    }

    if (!noti) {
      setMenuStyle({});
      return;
    }

    // Notifications dropdown: right-aligned to the parent button,
    // but when the screen is narrow it shifts toward center.
    const wrapperRect = wrapper.getBoundingClientRect();
    const menuWidth = menu.offsetWidth;
    const viewportWidth = window.innerWidth;
    const margin = 8;

    let desiredLeft = wrapperRect.right - menuWidth;
    if (menuWidth + margin * 2 > viewportWidth) {
      desiredLeft = (viewportWidth - menuWidth) / 2;
    }

    desiredLeft = Math.min(Math.max(desiredLeft, margin), viewportWidth - menuWidth - margin);
    const leftWithinWrapper = desiredLeft - wrapperRect.left;
    setMenuStyle({
      left: `${Math.round(leftWithinWrapper)}px`,
      right: "auto",
      transform: "none"
    });
  };

  const updateFixedPosition = () => {
    const wrapper = wrapperRef.current;
    const menu = dropdownRef.current;
    if (!wrapper || !menu) return;

    const getFixedContainingRect = () => {
      let node: HTMLElement | null = wrapper;
      while (node) {
        const parent = node.parentElement;
        if (!parent) break;
        if (parent === document.body) break;
        const style = window.getComputedStyle(parent);
        if (style.transform !== "none" || style.perspective !== "none" || style.filter !== "none") {
          return parent.getBoundingClientRect();
        }
        node = parent;
      }
      return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    };

    const wrapperRect = wrapper.getBoundingClientRect();
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const cb = getFixedContainingRect();
    const margin = 8;

    if (middleleftTop) {
      const desiredWidth = Math.round(wrapperRect.width) + 2;
      const leftPx = Math.min(
        Math.max(wrapperRect.left - 1, cb.left + margin),
        cb.left + cb.width - desiredWidth - margin
      );
      let topPx = wrapperRect.bottom;
      topPx = Math.min(Math.max(topPx, cb.top + margin), cb.top + cb.height - menuHeight - margin);

      setMenuStyle({
        left: `${Math.round(leftPx - cb.left)}px`,
        top: `${Math.round(topPx - cb.top)}px`,
        width: `${desiredWidth}px`,
        minWidth: `${desiredWidth}px`,
        right: "auto",
        transform: "none"
      });
      return;
    }

    let leftPx = wrapperRect.right - menuWidth;
    if (left) leftPx = wrapperRect.left;
    if (middle) leftPx = wrapperRect.left + wrapperRect.width / 2 - menuWidth / 2;
    if (middleleft) leftPx = wrapperRect.left - 5 - menuWidth;
    if (middleleft && leftPx < cb.left + margin) {
      leftPx = wrapperRect.right + 5;
    }
    leftPx = Math.min(Math.max(leftPx, cb.left + margin), cb.left + cb.width - menuWidth - margin);

    const belowTop = wrapperRect.bottom + 15;
    const aboveTop = wrapperRect.top - 15 - menuHeight;
    let topPx = belowTop;
    if (belowTop + menuHeight + margin > cb.top + cb.height) topPx = aboveTop;
    topPx = Math.min(Math.max(topPx, cb.top + margin), cb.top + cb.height - menuHeight - margin);

    setMenuStyle({
      left: `${Math.round(leftPx - cb.left)}px`,
      top: `${Math.round(topPx - cb.top)}px`,
      right: "auto",
      transform: "none"
    });
  };

  const handleClickOutside = (event: MouseEvent) => {
    const wrapper = wrapperRef.current;
    const menu = dropdownRef.current;
    if (
      wrapper &&
      !wrapper.contains(event.target as Node) &&
      menu &&
      !menu.contains(event.target as Node)
    ) {
      if (controlledOpen !== undefined) onClose?.();
      else setInternalOpen(false);
    }
  };

  useLayoutEffect(() => {
    if (!open) return;
    if (fixed) updateFixedPosition();
    else updatePosition();
  }, [left, right, middle, middleleft, middleleftTop, profile, noti, up, upDel, fixed, open]);

  useEffect(() => {
    if (fixed) updateFixedPosition();
    else updatePosition();

    const handleResize = () => {
      if (fixed) updateFixedPosition();
      else updatePosition();
    };

    window.addEventListener("resize", handleResize);
    document.addEventListener("pointerdown", handleClickOutside, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("pointerdown", handleClickOutside, true);
    };
  }, [left, right, middle, middleleft, middleleftTop, profile, noti, up, upDel, fixed, open]);

  return (
    <div
      ref={wrapperRef}
      className={`${styles.wrapper} ${__PLATFORM__ === 'desktop' ? styles.wrapper_desktop : styles.wrapper_mobile} ${wrapperClassName || ""}`.trim()}
    >
      <div onClick={toggleDropdown} className={`${styles.button || ""} ${buttonClassName || ""}`.trim()}>
        {button}
      </div>
      {open && (
        <div
          ref={dropdownRef}
          className={`${styles.menu} ${positionClass} ${menuClassName || ""}`.trim()}
          style={minWidthPx ? { ...menuStyle, minWidth: `${minWidthPx}px` } : menuStyle}
          onClick={handleDropdownClick}
        >
          {React.isValidElement(dropdown) &&
            React.Children.toArray(dropdown.props.children)
              .filter((child): child is React.ReactElement => React.isValidElement(child))
              .map((child, index) => {
                const extraClass = (child.props as { [key: string]: string })["data-dropdown-class"];
                return (
                  <div
                    key={index}
                    className={`${styles.item} ${extraClass || ""}`}
                    onClick={(event) => handleItemClick(event, child)}
                  >
                    {child}
                  </div>
                );
              })}
        </div>
      )}
    </div>
  );
};

export default DropdownWrapper;
