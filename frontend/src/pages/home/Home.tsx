import React from 'react';
import classes from './Home.module.scss';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import Lastdesks from '@/components/lastdesks/Lastdesks';
import FriendsList from '@/components/friendlist/Friendlist';
import { useAuthStore } from '@/store/authStore';

const Home = () => {
    
const { user, isAuth } = useAuthStore();

  console.log('user:', user);
  console.log('isAuth:', isAuth);
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

                <div className={classes.left}>
                    <Lastdesks />
                    <FriendsList />
                </div>
                <div className={classes.right}>
                    <section className={classes.friends_invites_container}>
                        <h2>Приглашения в друзья:</h2>
                        <div className={classes.friends_invites_list}>
                            <div className={classes.friends_invites_item}>
                                img name time
                            </div>
                        </div>
                        of if epmty
                        <div className={classes.friends_invites_list_epmty}>
                            <h3>Заявок в друзья не найдено</h3>
                            <Mainbtn
                                variant='mini'
                                text='пригласить в друзья'
                            />
                        </div>
                    </section>
                    <section className={classes.desks_invites_container}>
                        <h2>Приглашения в друзья:</h2>
                        <div className={classes.desks_invites_list}>
                            <div className={classes.desks_invites_item}>
                                img name time
                            </div>
                        </div>
                        of if epmty
                        <div className={classes.desks_invites_list_epmty}>
                            <h3>Пришлашений в доски не найдено</h3>
                            <Mainbtn
                                variant='mini'
                                text='Создать свою доску'
                            />
                        </div>
                    </section>
                    <section className={classes.todo_container}>
                        <h2>Ваши ToDo листы:</h2>
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
                        </div>
                    </section>
                </div>
            </main>
        </div>
        
    );
};

export default Home;