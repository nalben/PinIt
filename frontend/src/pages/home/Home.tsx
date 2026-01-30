import FlowBoardContainer from '@/components/flow/FlowBoardContainer';
import classes from './Home.module.scss'
import React from 'react';
import FlowBoard from '@/components/flow/FlowBoard';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';


const Home = () => {



    return (
        <div className={classes.home}>
            <main className={classes.home_container}>
                <section className={classes.welcome_container}>
                    <h1>Добро пожаловать в PinIt</h1>
                    <h2>Создайте свою доску или присоединяйтесь к доскам своих друзей</h2>
                    <Mainbtn
                        variant='mini'
                        text='Создать доску'
                    />
                </section>
                <div className={classes.left}>
                    <section className={classes.desks_container}>
                        <h2>последние открытые доски:</h2>
                        <div className={classes.desks_list}>
                            <div className={classes.desks_item}>
                                <img src="" alt="" />
                                <h3>название</h3>
                                <p>описание</p>
                                <Mainbtn
                                    variant='mini'
                                    text='открыть'
                                />
                            </div>
                        </div>
                        or if epmty
                        <div className={classes.desks_empty}>
                            <h2>Досок не найдено</h2>
                            <Mainbtn
                                variant='mini'
                                text='Создать доску'
                            />
                        </div>
                    </section>
                    <section className={classes.friends_container}>
                        <h2>Друзья:</h2>
                        <div className={classes.friends_list}>
                            <div className={classes.friends_list_item}>
                                img name open
                            </div>
                        </div>
                        of if epmty
                        <div className={classes.friends_list_epmty}>
                            <h2>Заявок в друзья не найдено</h2>
                            <Mainbtn
                                variant='mini'
                                text='пригласить в друзья'
                            />
                        </div>
                    </section>
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
                            <h2>Заявок в друзья не найдено</h2>
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
                            <h2>Пришлашений в доски не найдено</h2>
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
                            <h2>
                                ToDo листов не найдено
                            </h2>
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