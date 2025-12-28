import React from "react";
import classes from "./Welcome.module.scss";
import Mainbtn from "@/components/_UI/mainbtn/Mainbtn";
import AuthTrigger from "@/components/auth/AuthTrigger";

const Welcome = () => {
  return (
    <section className={classes.welcome}>
      <div className={classes.container}>
        <div className={classes.headline}>
          <h1>PinIt — Your Idea Board</h1>
          <h2>Sign in or create an account to start connecting your notes.</h2>
        </div>

        <div className={classes.buttons}>
          <AuthTrigger type="login">
            <Mainbtn text="login" type="button" variant="auth" />
          </AuthTrigger>

          <AuthTrigger type="register" closeOnOverlayClick={false}>
            <Mainbtn text="register" type="button" variant="auth" />
          </AuthTrigger>
        </div>
      </div>
    </section>
  );
};

export default Welcome;
