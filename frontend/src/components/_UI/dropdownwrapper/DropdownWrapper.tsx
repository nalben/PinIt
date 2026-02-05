import React, { useRef, useEffect, useLayoutEffect, useState } from "react";
import styles from "./DropdownWrapper.module.scss";

type DropdownWrapperProps = {
  left?: boolean;
  right?: boolean;
  profile?: boolean;
  noti?: boolean;
  middle?: boolean;
  children: [React.ReactNode, React.ReactNode];
  closeOnClick?: boolean;
  isOpen?: boolean; // управляемое состояние
  onClose?: () => void; // callback для закрытия
};

const DropdownWrapper: React.FC<DropdownWrapperProps> = ({
  left,
  right,
  middle,
  profile,
  noti,
  children,
  closeOnClick = true,
  isOpen: controlledOpen,
  onClose,
}) => {
  const [button, dropdown] = children;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [positionClass, setPositionClass] = useState("");
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [internalOpen, setInternalOpen] = useState(false);

  // используем управляемое состояние, если оно передано
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const toggleDropdown = () => {
    if (controlledOpen !== undefined) {
      controlledOpen ? onClose?.() : setInternalOpen(prev => !prev);
    } else {
      setInternalOpen(prev => !prev);
    }
  };

  const handleDropdownClick = (event: React.MouseEvent) => {
    if (!closeOnClick) event.stopPropagation();
  };

  const handleItemClick = () => {
    if (closeOnClick) {
      if (controlledOpen !== undefined) onClose?.();
      else setInternalOpen(false);
    }
  };

  const updatePosition = () => {
    const wrapper = wrapperRef.current;
    const menu = dropdownRef.current;
    if (!wrapper || !menu) return;

    const classes: string[] = [];
    if (profile) classes.push(styles.profile);
    if (noti) classes.push(styles.noti);
    if (!profile && !noti) {
      if (left) classes.push(styles.left);
      if (right) classes.push(styles.right);
      if (middle) classes.push(styles.middle);
      if (!left && !right && !middle) classes.push(styles.middle);
    }

    setPositionClass(classes.join(" "));

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
    if (open) updatePosition();
  }, [left, right, middle, profile, noti, open]);

  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [left, right, middle, profile, noti, open]);

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <div onClick={toggleDropdown} className={styles.button}>
        {button}
      </div>
      {open && (
        <div
          ref={dropdownRef}
          className={`${styles.menu} ${positionClass}`}
          style={menuStyle}
          onClick={handleDropdownClick}
        >
          {React.isValidElement(dropdown) &&
            React.Children.map(dropdown.props.children, (child, index) => {
              const extraClass =
                React.isValidElement(child) &&
                (child.props as { [key: string]: string })["data-dropdown-class"];
              return (
                <div
                  key={index}
                  className={`${styles.item} ${extraClass || ""}`}
                  onClick={handleItemClick}
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
