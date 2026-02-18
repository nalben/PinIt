import React from 'react';
import classes from './Spaces.module.scss';
import MyBoards from '@/components/boards/myboards/MyBoards';
import GuestBoards from '@/components/boards/guestboards/GuestBoards';
import FriendsBoards from '@/components/boards/friendsboards/FriendsBoards';
import PublicBoards from '@/components/boards/publicboards/PublicBoards';
import Lastboards from '@/components/boards/lastboards/Lastboards';

const Spaces = () => {
    return (
        <div className={classes.home}>
            <main className={classes.Spaces_container}>
                <div className={classes.spaces_container}>
                    <div className={classes.myboards_container}>
                        <MyBoards />
                    </div>
                    <div className={classes.guestboards_container}>
                        <GuestBoards />
                    </div>
                    <div className={classes.lastboards_container}>
                        <Lastboards />
                    </div>
                    <div className={classes.friendsboards_container}>
                        <FriendsBoards />
                    </div>
                    <div className={classes.publicboards_container}>
                        <PublicBoards />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Spaces;
