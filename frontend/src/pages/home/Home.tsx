import React from 'react';
import classes from './Home.module.scss';
import Lastboards from '@/components/lastboards/Lastboards';
import FriendsList from '@/components/friendlist/Friendlist';
import FriendsInvites from '@/components/friendsinvites/FriendsInvites';
import BoardsInvites from '@/components/boardsinvites/BoardsInvites';
import HomeWelcome from '@/components/homewelcome/HomeWelcome';

const Home = () => {
    return (
        <div className={classes.home}>
            <main className={classes.home_container}>
                <HomeWelcome />
                <div className={classes.lastboards_container}>
                    <Lastboards />
                </div>
                <div className={classes.friends_container}>
                    <FriendsList />
                </div>
                <section className={classes.friends_invites_container}>
                    <FriendsInvites />
                </section>
                <section className={classes.desks_invites_container}>
                    <BoardsInvites />
                </section>
                <section className={classes.todo_container}>
                    {/* <h2>Ваши ToDo листы:</h2>
                    <div className={classes.todo_items}>
                        name open
                    </div>
                    or if empty
                    <div className={classes.todo_items_empty}>
                        <h3>
                            ToDo листов не найдено
                        </h3>
                        <Mainbtn
                            text='Создать лист'
                            variant='mini'
                        />
                    </div> */}
                    ToDo в разработке...
                </section>
            </main>
        </div>
        
    );
};

export default Home;
