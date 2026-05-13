ALTER TABLE "public"."companies" ADD COLUMN "api_token" text;
ALTER TABLE "public"."companies" ADD CONSTRAINT "companies_api_token_key" UNIQUE ("api_token");
