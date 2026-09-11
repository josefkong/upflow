CREATE TABLE "TaskFollower" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskFollower_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskFollower_task_id_user_id_key" ON "TaskFollower"("task_id", "user_id");
CREATE INDEX "TaskFollower_user_id_idx" ON "TaskFollower"("user_id");

ALTER TABLE "TaskFollower" ADD CONSTRAINT "TaskFollower_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskFollower" ADD CONSTRAINT "TaskFollower_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- This table is server-only. Task access is enforced by authenticated routes.
ALTER TABLE "TaskFollower" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "TaskFollower" FROM anon, authenticated;
