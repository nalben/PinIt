import React, { useRef, useEffect, useState } from "react";
import styles from "./DropdownWrapper.module.scss";

type DropdownWrapperProps = {
  left?: boolean;
  right?: boolean;
  profile?: boolean;
  noti?: boolean;
  middle?: boolean;
  children: [React.ReactNode, React.ReactNode];
  closeOnClick?: boolean;
};

const DropdownWrapper: React.FC<DropdownWrapperProps> = ({
  left,
  right,
  middle,
  profile,
  noti,
  children,
  closeOnClick = true,
}) => {
  const [button, dropdown] = children;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [positionClass, setPositionClass] = useState("");
  const [open, setOpen] = useState(false);

  const toggleDropdown = () => setOpen(prev => !prev);

  const updatePosition = () => {
    const wrapper = wrapperRef.current;
    const menu = dropdownRef.current;
    if (!wrapper || !menu) return;

    const classes: string[] = [];
    if (left) classes.push(styles.left);
    if (right) classes.push(styles.right);
    if (profile) classes.push(styles.profile);
    if (noti) classes.push(styles.noti);
    if (middle) classes.push(styles.middle);

    if (!left && !right && !profile && !middle && !noti) {
      classes.push(styles.middle);
    }

    setPositionClass(classes.join(" "));

    const wrapperRect = wrapper.getBoundingClientRect();
    const menuWidth = menu.offsetWidth;
    const menuLeft = wrapperRect.left + menu.offsetLeft;
    const menuRight = menuLeft + menuWidth;
    const viewportWidth = window.innerWidth;

    if (menuRight > viewportWidth && !classes.includes(styles.right))
      setPositionClass(prev => `${prev} ${styles.right}`);
    if (menuLeft < 0 && !classes.includes(styles.left))
      setPositionClass(prev => `${prev} ${styles.left}`);
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
      setOpen(false);
    }
  };

  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [left, right, middle, profile, noti, open]);

  const handleDropdownClick = (event: React.MouseEvent) => {
    if (!closeOnClick) {
      event.stopPropagation();
    }
  };

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <div onClick={toggleDropdown} className={styles.button}>
        {button}
      </div>
      {open && (
        <div
          ref={dropdownRef}
          className={`${styles.menu} ${positionClass}`}
          onClick={(event) => {
            if (closeOnClick) {
              setOpen(false);
            }
            handleDropdownClick(event);
          }}
        >
          {React.isValidElement(dropdown) &&
            React.Children.map(dropdown.props.children, (child, index) => (
              <div key={index} className={styles.item}>
                {child}
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

export default DropdownWrapper;