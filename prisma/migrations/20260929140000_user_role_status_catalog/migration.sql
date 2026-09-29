ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';

UPDATE "users"
SET "status" = CASE WHEN "active" THEN 'ACTIVE' ELSE 'INACTIVE' END
WHERE "status" IS NULL OR "status" = '';

UPDATE "users"
SET "role" = CASE LOWER("role")
  WHEN 'admin' THEN 'ADMIN'
  WHEN 'operator' THEN 'EDITOR'
  WHEN 'viewer' THEN 'USER'
  WHEN 'superuser' THEN 'SUPERUSER'
  ELSE UPPER("role")
END;

CREATE TABLE IF NOT EXISTS "user_roles" (
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "permissions" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_roles_pkey" PRIMARY KEY ("code")
);

CREATE TABLE IF NOT EXISTS "user_statuses" (
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_statuses_pkey" PRIMARY KEY ("code")
);

INSERT INTO "user_roles" ("code", "name", "permissions") VALUES
  ('ADMIN', 'Administrator', '["scan.image","scan.video","scan.camera","results.save","users.manage"]'::jsonb),
  ('EDITOR', 'Editor', '["scan.image","scan.video","scan.camera","results.save"]'::jsonb),
  ('USER', 'User', '[]'::jsonb),
  ('SUPERUSER', 'Super User', '["*"]'::jsonb)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "permissions" = EXCLUDED."permissions",
  "active" = TRUE,
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "user_statuses" ("code", "name") VALUES
  ('ACTIVE', 'Active'),
  ('INACTIVE', 'Inactive'),
  ('SUSPENDED', 'Suspended')
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "active" = TRUE,
  "updated_at" = CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "ix_users_status" ON "users" ("status");
