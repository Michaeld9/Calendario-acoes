SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

USE event_calendar;

DROP TABLE IF EXISTS event_audit_logs;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS app_settings;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  full_name VARCHAR(255) NULL,
  avatar_url TEXT NULL,
  auth_type ENUM("local", "google") NOT NULL DEFAULT "google",
  google_id VARCHAR(255) NULL UNIQUE,
  role ENUM("admin", "supervisor", "coordenador", "aguardando") NOT NULL DEFAULT "coordenador",
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  involved_emails TEXT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  all_day TINYINT(1) NOT NULL DEFAULT 0,
  event_type ENUM(
    "Evento",
    "Ação Pontual",
    "Projeto Institucional",
    "Projeto Pedagógico",
    "Expedição Pedagógica",
    "Formação",
    "Festa"
  ) NOT NULL,
  status ENUM("pending", "approved", "rejected") NOT NULL DEFAULT "pending",
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  approved_by INT UNSIGNED NULL,
  approved_at DATETIME NULL,
  google_calendar_event_id VARCHAR(255) NULL,
  CONSTRAINT chk_event_dates CHECK (end_date >= start_date),
  CONSTRAINT fk_events_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_events_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE event_audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(80) NOT NULL,
  event_id INT UNSIGNED NULL,
  event_title VARCHAR(255) NULL,
  actor_user_id INT UNSIGNED NOT NULL,
  actor_email VARCHAR(255) NOT NULL,
  actor_name VARCHAR(255) NULL,
  details TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_settings (
  setting_key VARCHAR(120) PRIMARY KEY,
  setting_value TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_google_id ON users (google_id);
CREATE INDEX idx_events_created_by ON events (created_by);
CREATE INDEX idx_events_status ON events (status);
CREATE INDEX idx_events_start_date ON events (start_date);
CREATE INDEX idx_events_approved_by ON events (approved_by);
CREATE INDEX idx_event_audit_logs_created_at ON event_audit_logs (created_at);
CREATE INDEX idx_event_audit_logs_actor_user_id ON event_audit_logs (actor_user_id);
CREATE INDEX idx_event_audit_logs_event_id ON event_audit_logs (event_id);
CREATE INDEX idx_event_audit_logs_action ON event_audit_logs (action);
