// src/migrations/xxxxxx_create_friends_requests.js

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('friends_requests', {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      friend_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('sent', 'accepted', 'rejected'),
        defaultValue: 'sent'
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('friends_requests');
  }
};