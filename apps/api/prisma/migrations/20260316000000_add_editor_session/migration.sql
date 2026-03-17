-- CreateTable
CREATE TABLE "EditorSession" (
    "id" TEXT NOT NULL,
    "terminal_session_id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "language_id" TEXT,
    "root_uri" TEXT,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "ended_at" TIMESTAMPTZ,
    "status" "TerminalSessionStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "EditorSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EditorSession_terminal_session_id_idx" ON "EditorSession"("terminal_session_id");

-- CreateIndex
CREATE INDEX "EditorSession_instance_id_idx" ON "EditorSession"("instance_id");

-- CreateIndex
CREATE INDEX "EditorSession_user_id_idx" ON "EditorSession"("user_id");

-- CreateIndex
CREATE INDEX "EditorSession_status_idx" ON "EditorSession"("status");

-- AddForeignKey
ALTER TABLE "EditorSession" ADD CONSTRAINT "EditorSession_terminal_session_id_fkey" FOREIGN KEY ("terminal_session_id") REFERENCES "TerminalSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorSession" ADD CONSTRAINT "EditorSession_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
