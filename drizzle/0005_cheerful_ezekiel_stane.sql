CREATE TABLE "custom_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"hint" text DEFAULT '' NOT NULL,
	"role" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "custom_piece_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"slug" text NOT NULL,
	"category_id" text NOT NULL,
	"role" text NOT NULL,
	"label" text NOT NULL,
	"plural" text NOT NULL,
	"fit_options" text[],
	"variant_options" text[],
	"material_options" text[] NOT NULL,
	"pattern_options" text[] NOT NULL,
	"suggested_colors" text[] NOT NULL,
	"default_weight" text NOT NULL,
	"base_warmth" real NOT NULL,
	"base_formality" real NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "piece_art" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type_id" text NOT NULL,
	"variant" text,
	"view_box" text NOT NULL,
	"body" text NOT NULL,
	"source" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"llm" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_categories" ADD CONSTRAINT "custom_categories_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_piece_types" ADD CONSTRAINT "custom_piece_types_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_art" ADD CONSTRAINT "piece_art_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_categories_user_slug_idx" ON "custom_categories" USING btree ("user_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_piece_types_user_slug_idx" ON "custom_piece_types" USING btree ("user_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "piece_art_user_type_variant_idx" ON "piece_art" USING btree ("user_id","type_id",coalesce("variant", ''));