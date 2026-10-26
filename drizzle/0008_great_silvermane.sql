ALTER TABLE "inspos" ADD COLUMN "image_hash" text;--> statement-breakpoint
UPDATE "inspos" SET "image_hash" = encode(sha256("image"), 'hex') WHERE "image_hash" IS NULL;--> statement-breakpoint
CREATE INDEX "inspos_user_hash_idx" ON "inspos" USING btree ("user_id","image_hash");