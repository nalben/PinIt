// src/models/friends.js

const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Friend = sequelize.define('friends', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false
  },
  friend_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false
  }
}, {
  tableName: 'friends',
  timestamps: false
});

module.exports = Friend;