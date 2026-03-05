-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Хост: 127.0.0.1
-- Время создания: Мар 05 2026 г., 08:51
-- Версия сервера: 10.4.32-MariaDB
-- Версия PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- База данных: `pinit`
--

-- --------------------------------------------------------

--
-- Структура таблицы `activitylog`
--

CREATE TABLE `activitylog` (
  `id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `board_id` int(10) UNSIGNED DEFAULT NULL,
  `card_id` int(10) UNSIGNED DEFAULT NULL,
  `action` enum('create','update','delete','comment','invite_guest') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `boardguests`
--

CREATE TABLE `boardguests` (
  `id` int(10) UNSIGNED NOT NULL,
  `board_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `role` enum('guest','editer','blocked') NOT NULL DEFAULT 'guest',
  `added_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `boardguests`
--

INSERT INTO `boardguests` (`id`, `board_id`, `user_id`, `role`, `added_at`) VALUES
(11, 5, 1, 'guest', '2026-02-24 19:13:27'),
(63, 2, 16, 'guest', '2026-02-26 20:57:21');

-- --------------------------------------------------------

--
-- Структура таблицы `boards`
--

CREATE TABLE `boards` (
  `id` int(10) UNSIGNED NOT NULL,
  `owner_id` int(10) UNSIGNED NOT NULL,
  `title` varchar(20) NOT NULL,
  `description` varchar(80) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `is_public` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `boards`
--

INSERT INTO `boards` (`id`, `owner_id`, `title`, `description`, `image`, `created_at`, `is_public`) VALUES
(2, 1, 'Reverend Insanity', '111', '/uploads/1772088838423-123922907.jpg', '2026-02-03 12:04:20', 1),
(5, 16, 'yula board', NULL, '/uploads/1772088885970-497890130.jpg', '2026-02-04 21:26:15', 0);

-- --------------------------------------------------------

--
-- Структура таблицы `boardsettings`
--

CREATE TABLE `boardsettings` (
  `id` int(10) UNSIGNED NOT NULL,
  `board_id` int(10) UNSIGNED NOT NULL,
  `zoom` decimal(3,2) DEFAULT 1.00,
  `background_color` varchar(20) DEFAULT NULL,
  `background_image` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `board_invites`
--

CREATE TABLE `board_invites` (
  `id` int(10) UNSIGNED NOT NULL,
  `board_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `invited_id` int(10) UNSIGNED NOT NULL,
  `status` enum('sent','accepted','rejected') NOT NULL DEFAULT 'sent',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `board_invite_links`
--

CREATE TABLE `board_invite_links` (
  `id` int(10) UNSIGNED NOT NULL,
  `board_id` int(10) UNSIGNED NOT NULL,
  `token` varchar(64) NOT NULL,
  `created_by` int(10) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `board_invite_links`
--

INSERT INTO `board_invite_links` (`id`, `board_id`, `token`, `created_by`, `created_at`, `updated_at`) VALUES
(1, 2, '66c31b0f94f4dc963b8ab59a56e03a494af657b1c782cedc', 1, '2026-02-24 19:03:24', '2026-02-25 21:41:15'),
(2, 5, '08c5740ce6da8515aa18bb6602d939a33f7643dcf9bd8da9', 16, '2026-02-24 19:13:17', '2026-02-24 19:13:21'),
(3, 12, 'b4c6573bb7c166ea894419d89cf7548c7d53af4a57c6e8fa', 1, '2026-02-27 11:18:13', '2026-02-27 11:18:13'),
(4, 13, '631f75b8ac1952f3fcf1c94f8cd0e71573444c609d674b51', 1, '2026-02-27 11:21:59', '2026-02-27 11:21:59'),
(5, 14, 'fa218e3b586ee89ae8739a2bc18241508820fdcbd86fc8a9', 1, '2026-03-03 14:07:54', '2026-03-03 14:07:54'),
(6, 15, '666018a173acd24618b519811460440b9c4872d5334a4abf', 1, '2026-03-04 15:28:26', '2026-03-04 15:28:26');

-- --------------------------------------------------------

--
-- Структура таблицы `board_visits`
--

CREATE TABLE `board_visits` (
  `user_id` int(10) UNSIGNED NOT NULL,
  `board_id` int(10) UNSIGNED NOT NULL,
  `last_visited_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `board_visits`
--

INSERT INTO `board_visits` (`user_id`, `board_id`, `last_visited_at`) VALUES
(1, 6, '2026-02-16 12:11:09'),
(1, 7, '2026-02-16 12:38:55'),
(1, 4, '2026-02-18 22:57:05'),
(1, 10, '2026-02-18 22:57:24'),
(1, 5, '2026-03-04 10:20:17'),
(1, 2, '2026-03-05 07:46:38'),
(16, 5, '2026-02-26 21:00:39'),
(16, 2, '2026-03-03 18:05:23'),
(18, 10, '2026-02-18 12:25:38');

-- --------------------------------------------------------

--
-- Структура таблицы `cardcomments`
--

CREATE TABLE `cardcomments` (
  `id` int(10) UNSIGNED NOT NULL,
  `card_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `content` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `carddetails`
--

CREATE TABLE `carddetails` (
  `card_id` int(10) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `carddetails`
--

INSERT INTO `carddetails` (`card_id`, `created_at`, `updated_at`) VALUES
(31, '2026-03-02 21:55:32', '2026-03-02 21:55:32'),
(37, '2026-03-03 16:03:41', '2026-03-03 16:03:41'),
(38, '2026-03-03 17:54:43', '2026-03-03 17:54:43');

-- --------------------------------------------------------

--
-- Структура таблицы `carddetail_blocks`
--

CREATE TABLE `carddetail_blocks` (
  `id` int(10) UNSIGNED NOT NULL,
  `card_id` int(10) UNSIGNED NOT NULL,
  `block_type` enum('text','image','facts','checklist') NOT NULL,
  `sort_order` int(10) UNSIGNED NOT NULL,
  `heading` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `carddetail_checklist_items`
--

CREATE TABLE `carddetail_checklist_items` (
  `id` int(10) UNSIGNED NOT NULL,
  `block_id` int(10) UNSIGNED NOT NULL,
  `content` varchar(200) NOT NULL,
  `is_checked` tinyint(1) NOT NULL DEFAULT 0,
  `sort_order` int(10) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `carddetail_fact_items`
--

CREATE TABLE `carddetail_fact_items` (
  `id` int(10) UNSIGNED NOT NULL,
  `block_id` int(10) UNSIGNED NOT NULL,
  `content` varchar(200) NOT NULL,
  `sort_order` int(10) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `carddetail_image_blocks`
--

CREATE TABLE `carddetail_image_blocks` (
  `block_id` int(10) UNSIGNED NOT NULL,
  `image_path` varchar(255) NOT NULL,
  `caption` varchar(70) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `carddetail_text_blocks`
--

CREATE TABLE `carddetail_text_blocks` (
  `block_id` int(10) UNSIGNED NOT NULL,
  `content` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `cardlinks`
--

CREATE TABLE `cardlinks` (
  `id` int(10) UNSIGNED NOT NULL,
  `board_id` int(10) UNSIGNED NOT NULL,
  `from_card_id` int(10) UNSIGNED NOT NULL,
  `to_card_id` int(10) UNSIGNED NOT NULL,
  `style` enum('line','arrow') NOT NULL DEFAULT 'line',
  `color` char(7) NOT NULL DEFAULT '#000000',
  `label` varchar(70) DEFAULT NULL,
  `is_label_visible` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `cardlinks`
--

INSERT INTO `cardlinks` (`id`, `board_id`, `from_card_id`, `to_card_id`, `style`, `color`, `label`, `is_label_visible`, `created_at`) VALUES
(37, 2, 38, 37, 'line', '#e7cd73', NULL, 1, '2026-03-03 17:54:44'),
(39, 2, 31, 38, 'arrow', '#e7cd73', NULL, 1, '2026-03-03 17:54:47'),
(40, 2, 31, 37, 'line', '#e7cd73', NULL, 1, '2026-03-04 15:14:06');

-- --------------------------------------------------------

--
-- Структура таблицы `cards`
--

CREATE TABLE `cards` (
  `id` int(10) UNSIGNED NOT NULL,
  `board_id` int(10) UNSIGNED NOT NULL,
  `type` enum('circle','rectangle','diamond') NOT NULL,
  `title` varchar(50) DEFAULT NULL,
  `image_path` varchar(255) DEFAULT NULL,
  `x` float NOT NULL DEFAULT 0,
  `y` float NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `is_locked` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `cards`
--

INSERT INTO `cards` (`id`, `board_id`, `type`, `title`, `image_path`, `x`, `y`, `created_at`, `is_locked`) VALUES
(31, 2, 'circle', 'title', '/uploads/1772523633616-518827232.jpg', 3135.58, -2919.52, '2026-03-02 21:55:32', 1),
(37, 2, 'diamond', 'title', NULL, 3176.06, -2529.79, '2026-03-03 16:03:41', 1),
(38, 2, 'rectangle', 'title', '/uploads/1772560492157-618935170.jpg', 3528.21, -2685.82, '2026-03-03 17:54:43', 1);

-- --------------------------------------------------------

--
-- Структура таблицы `email_verifications`
--

CREATE TABLE `email_verifications` (
  `email` varchar(255) NOT NULL,
  `code` varchar(6) DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `friends`
--

CREATE TABLE `friends` (
  `user_id` int(10) UNSIGNED NOT NULL,
  `friend_id` int(10) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;

--
-- Дамп данных таблицы `friends`
--

INSERT INTO `friends` (`user_id`, `friend_id`, `created_at`) VALUES
(1, 16, '2026-03-03 18:47:13'),
(16, 1, '2026-03-03 18:47:13');

-- --------------------------------------------------------

--
-- Структура таблицы `friend_requests`
--

CREATE TABLE `friend_requests` (
  `id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `friend_id` int(10) UNSIGNED NOT NULL,
  `status` enum('sent','accepted','rejected') NOT NULL DEFAULT 'sent',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `users`
--

CREATE TABLE `users` (
  `id` int(10) UNSIGNED NOT NULL,
  `username` varchar(50) NOT NULL,
  `nickname` varchar(50) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('admin','user') NOT NULL DEFAULT 'user',
  `avatar` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `email` varchar(255) NOT NULL,
  `status` varchar(100) DEFAULT NULL,
  `friend_code` varchar(8) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `users`
--

INSERT INTO `users` (`id`, `username`, `nickname`, `password_hash`, `role`, `avatar`, `created_at`, `email`, `status`, `friend_code`) VALUES
(1, 'nalben', 'NALBEN', '$2b$10$Iqo4lkeOh6IIssg1FSngt.yKesJ81LOBBT9JyTAoGgAKJBggcXD4C', 'admin', '/uploads/1772562860298-905780266.jpg', '2025-11-22 17:42:49', 'baroqueworks64502@gmail.com', 'ёжики на лето', '42014793'),
(16, 'yula', '', '$2b$10$Iqo4lkeOh6IIssg1FSngt.yKesJ81LOBBT9JyTAoGgAKJBggcXD4C', 'user', '/uploads/1772088899000-887767376.jpg', '2025-12-27 19:07:56', 'potorocinvana1@gmail.com', 'Когда Бог создал ясень, все остальные деревья в лесу стали завидовать', '88458724');

--
-- Индексы сохранённых таблиц
--

--
-- Индексы таблицы `activitylog`
--
ALTER TABLE `activitylog`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `board_id` (`board_id`),
  ADD KEY `activitylog_ibfk_3` (`card_id`);

--
-- Индексы таблицы `boardguests`
--
ALTER TABLE `boardguests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `board_id` (`board_id`,`user_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Индексы таблицы `boards`
--
ALTER TABLE `boards`
  ADD PRIMARY KEY (`id`),
  ADD KEY `owner_id` (`owner_id`);

--
-- Индексы таблицы `boardsettings`
--
ALTER TABLE `boardsettings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `board_id` (`board_id`);

--
-- Индексы таблицы `board_invites`
--
ALTER TABLE `board_invites`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_board_invite` (`board_id`,`invited_id`),
  ADD KEY `idx_board_invites_board_id` (`board_id`),
  ADD KEY `idx_board_invites_user_id` (`user_id`),
  ADD KEY `idx_board_invites_invited_id` (`invited_id`);

--
-- Индексы таблицы `board_invite_links`
--
ALTER TABLE `board_invite_links`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_board_invite_links_board_id` (`board_id`),
  ADD UNIQUE KEY `uniq_board_invite_links_token` (`token`),
  ADD KEY `idx_board_invite_links_created_by` (`created_by`);

--
-- Индексы таблицы `board_visits`
--
ALTER TABLE `board_visits`
  ADD PRIMARY KEY (`user_id`,`board_id`),
  ADD KEY `user_id` (`user_id`,`last_visited_at`);

--
-- Индексы таблицы `cardcomments`
--
ALTER TABLE `cardcomments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cardcomments_card_id` (`card_id`),
  ADD KEY `idx_cardcomments_user_id` (`user_id`);

--
-- Индексы таблицы `carddetails`
--
ALTER TABLE `carddetails`
  ADD PRIMARY KEY (`card_id`);

--
-- Индексы таблицы `carddetail_blocks`
--
ALTER TABLE `carddetail_blocks`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_carddetail_blocks_card_order` (`card_id`,`sort_order`),
  ADD KEY `idx_carddetail_blocks_card_id` (`card_id`);

--
-- Индексы таблицы `carddetail_checklist_items`
--
ALTER TABLE `carddetail_checklist_items`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_carddetail_checklist_items_block_order` (`block_id`,`sort_order`),
  ADD KEY `idx_carddetail_checklist_items_block_id` (`block_id`);

--
-- Индексы таблицы `carddetail_fact_items`
--
ALTER TABLE `carddetail_fact_items`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_carddetail_fact_items_block_order` (`block_id`,`sort_order`),
  ADD KEY `idx_carddetail_fact_items_block_id` (`block_id`);

--
-- Индексы таблицы `carddetail_image_blocks`
--
ALTER TABLE `carddetail_image_blocks`
  ADD PRIMARY KEY (`block_id`);

--
-- Индексы таблицы `carddetail_text_blocks`
--
ALTER TABLE `carddetail_text_blocks`
  ADD PRIMARY KEY (`block_id`);

--
-- Индексы таблицы `cardlinks`
--
ALTER TABLE `cardlinks`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_cardlinks_unique` (`from_card_id`,`to_card_id`,`style`),
  ADD KEY `idx_cardlinks_board_id` (`board_id`),
  ADD KEY `idx_cardlinks_from_card_id` (`from_card_id`),
  ADD KEY `idx_cardlinks_to_card_id` (`to_card_id`);

--
-- Индексы таблицы `cards`
--
ALTER TABLE `cards`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cards_board_id` (`board_id`);

--
-- Индексы таблицы `email_verifications`
--
ALTER TABLE `email_verifications`
  ADD PRIMARY KEY (`email`);

--
-- Индексы таблицы `friends`
--
ALTER TABLE `friends`
  ADD PRIMARY KEY (`user_id`,`friend_id`),
  ADD KEY `fk_friends_friend` (`friend_id`);

--
-- Индексы таблицы `friend_requests`
--
ALTER TABLE `friend_requests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_request` (`user_id`,`friend_id`),
  ADD KEY `friend_id` (`friend_id`);

--
-- Индексы таблицы `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD UNIQUE KEY `ux_users_username` (`username`),
  ADD UNIQUE KEY `uk_users_friend_code` (`friend_code`);

--
-- AUTO_INCREMENT для сохранённых таблиц
--

--
-- AUTO_INCREMENT для таблицы `activitylog`
--
ALTER TABLE `activitylog`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT для таблицы `boardguests`
--
ALTER TABLE `boardguests`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=64;

--
-- AUTO_INCREMENT для таблицы `boards`
--
ALTER TABLE `boards`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT для таблицы `boardsettings`
--
ALTER TABLE `boardsettings`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT для таблицы `board_invites`
--
ALTER TABLE `board_invites`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=135;

--
-- AUTO_INCREMENT для таблицы `board_invite_links`
--
ALTER TABLE `board_invite_links`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT для таблицы `cardcomments`
--
ALTER TABLE `cardcomments`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT для таблицы `carddetail_blocks`
--
ALTER TABLE `carddetail_blocks`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT для таблицы `carddetail_checklist_items`
--
ALTER TABLE `carddetail_checklist_items`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT для таблицы `carddetail_fact_items`
--
ALTER TABLE `carddetail_fact_items`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT для таблицы `cardlinks`
--
ALTER TABLE `cardlinks`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=46;

--
-- AUTO_INCREMENT для таблицы `cards`
--
ALTER TABLE `cards`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=45;

--
-- AUTO_INCREMENT для таблицы `friend_requests`
--
ALTER TABLE `friend_requests`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=688;

--
-- AUTO_INCREMENT для таблицы `users`
--
ALTER TABLE `users`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=23;

--
-- Ограничения внешнего ключа сохраненных таблиц
--

--
-- Ограничения внешнего ключа таблицы `activitylog`
--
ALTER TABLE `activitylog`
  ADD CONSTRAINT `activitylog_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `activitylog_ibfk_2` FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `activitylog_ibfk_3` FOREIGN KEY (`card_id`) REFERENCES `cards` (`id`) ON DELETE SET NULL;

--
-- Ограничения внешнего ключа таблицы `boardguests`
--
ALTER TABLE `boardguests`
  ADD CONSTRAINT `boardguests_ibfk_1` FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `boardguests_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `boards`
--
ALTER TABLE `boards`
  ADD CONSTRAINT `boards_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `boardsettings`
--
ALTER TABLE `boardsettings`
  ADD CONSTRAINT `boardsettings_ibfk_1` FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `board_invites`
--
ALTER TABLE `board_invites`
  ADD CONSTRAINT `fk_board_invites_board` FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_board_invites_invited` FOREIGN KEY (`invited_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_board_invites_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `cardcomments`
--
ALTER TABLE `cardcomments`
  ADD CONSTRAINT `fk_cardcomments_card_id` FOREIGN KEY (`card_id`) REFERENCES `cards` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_cardcomments_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `carddetails`
--
ALTER TABLE `carddetails`
  ADD CONSTRAINT `fk_carddetails_card_id` FOREIGN KEY (`card_id`) REFERENCES `cards` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `carddetail_blocks`
--
ALTER TABLE `carddetail_blocks`
  ADD CONSTRAINT `fk_carddetail_blocks_card_id` FOREIGN KEY (`card_id`) REFERENCES `carddetails` (`card_id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `carddetail_checklist_items`
--
ALTER TABLE `carddetail_checklist_items`
  ADD CONSTRAINT `fk_carddetail_checklist_items_block_id` FOREIGN KEY (`block_id`) REFERENCES `carddetail_blocks` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `carddetail_fact_items`
--
ALTER TABLE `carddetail_fact_items`
  ADD CONSTRAINT `fk_carddetail_fact_items_block_id` FOREIGN KEY (`block_id`) REFERENCES `carddetail_blocks` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `carddetail_image_blocks`
--
ALTER TABLE `carddetail_image_blocks`
  ADD CONSTRAINT `fk_carddetail_image_blocks_block_id` FOREIGN KEY (`block_id`) REFERENCES `carddetail_blocks` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `carddetail_text_blocks`
--
ALTER TABLE `carddetail_text_blocks`
  ADD CONSTRAINT `fk_carddetail_text_blocks_block_id` FOREIGN KEY (`block_id`) REFERENCES `carddetail_blocks` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `cardlinks`
--
ALTER TABLE `cardlinks`
  ADD CONSTRAINT `fk_cardlinks_board_id` FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_cardlinks_from_card_id` FOREIGN KEY (`from_card_id`) REFERENCES `cards` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_cardlinks_to_card_id` FOREIGN KEY (`to_card_id`) REFERENCES `cards` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `cards`
--
ALTER TABLE `cards`
  ADD CONSTRAINT `fk_cards_board_id` FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `friends`
--
ALTER TABLE `friends`
  ADD CONSTRAINT `fk_friends_friend` FOREIGN KEY (`friend_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_friends_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `friend_requests`
--
ALTER TABLE `friend_requests`
  ADD CONSTRAINT `friend_requests_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `friend_requests_ibfk_2` FOREIGN KEY (`friend_id`) REFERENCES `users` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
