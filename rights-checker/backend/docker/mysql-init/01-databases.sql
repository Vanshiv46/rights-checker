-- One database per data-owning service. Runs once, on an empty MySQL data volume.
CREATE DATABASE IF NOT EXISTS auth_db CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS session_db CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS eligibility_db CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS scheme_db CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

GRANT ALL PRIVILEGES ON auth_db.* TO 'rec'@'%';
GRANT ALL PRIVILEGES ON session_db.* TO 'rec'@'%';
GRANT ALL PRIVILEGES ON eligibility_db.* TO 'rec'@'%';
GRANT ALL PRIVILEGES ON scheme_db.* TO 'rec'@'%';
FLUSH PRIVILEGES;
