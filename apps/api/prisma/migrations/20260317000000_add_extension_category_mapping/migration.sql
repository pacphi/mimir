-- CreateTable
CREATE TABLE "ExtensionCategoryMapping" (
    "id" TEXT NOT NULL,
    "sindri_category" TEXT NOT NULL,
    "display_label" TEXT NOT NULL,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtensionCategoryMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionCategoryMapping_sindri_category_key" ON "ExtensionCategoryMapping"("sindri_category");

-- CreateIndex
CREATE INDEX "ExtensionCategoryMapping_sort_order_idx" ON "ExtensionCategoryMapping"("sort_order");
