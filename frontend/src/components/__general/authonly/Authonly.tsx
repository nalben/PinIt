import React from "react";

interface Props {
  children: JSX.Element;
}

const AuthOnly: React.FC<Props> = ({ children }) => {
  const token = localStorage.getItem("token");

  if (!token) return null;

  return children;
};

export default AuthOnly;
