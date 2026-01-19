// src/models/friendsRequests.js

const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FriendsRequest = sequelize.define('friends_requests', {
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
  },
  status: {
    type: DataTypes.ENUM('sent', 'accepted', 'rejected'),
    defaultValue: 'sent'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW
  }
}, {
  tableName: 'friends_requests',
  timestamps: false
});

module.exports = FriendsRequest;