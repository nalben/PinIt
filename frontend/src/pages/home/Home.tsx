import React from 'react';
import classes from './Home.module.scss';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import Lastdesks from '@/components/lastdesks/Lastdesks';
import FriendsList from '@/components/friendlist/Friendlist';
import FriendsInvites from '@/components/friendsinvites/FriendsInvites';
import BoardsInvites from '@/components/boardsinvites/BoardsInvites';

const Home = () => {
    return (
        <div className={classes.home}>
            <main className={classes.home_container}>
                <section className={classes.welcome_container}>
                    <h1>Добро пожаловать в&nbsp;PinIt</h1>
                    <h2>Создайте свою доску или присоединяйтесь к доскам своих друзей</h2>
                    <Mainbtn
                        variant='mini'
                        text='Создать доску'
                    />
                </section>
                <div className={classes.lastdesks_container}>
                    <Lastdesks />
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
                    В разработке...
                </section>
            </main>
        </div>
        
    );
};

export default Home;
