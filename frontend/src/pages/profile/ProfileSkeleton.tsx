import React from "react";
import classes from "./Profile.module.scss";
import Mainbtn from "@/components/_UI/mainbtn/Mainbtn";

const ProfileSkeleton = () => {
  return (
    <div className={classes.profile}>
      <div className={`${classes.avatar_con} ${classes.skeleton} ${classes.skeleton_avatar}`} />
      <div className={classes.profile_username}>
        <div className={`${classes.skeleton} ${classes.skeleton_line}`} />
        <div className={`${classes.skeleton} ${classes.skeleton_line_sm}`} />
        <div className={classes.skeleton_row}>
          <div className={`${classes.skeleton} ${classes.skeleton_icon}`} />
          <div className={`${classes.skeleton} ${classes.skeleton_line_xs}`} />
        </div>
          <div className={`${classes.skeleton} ${classes.skeleton_line_xs}`} />
      </div>
      <div className={classes.friends}>
        <div className={classes.interact_btns}>
          <div className={`${classes.skeleton} ${classes.skeleton_btn}`} />
          <div className={`${classes.skeleton} ${classes.skeleton_btn}`} />
        </div>
      </div>
    </div>
  );
};

export default ProfileSkeleton;
