-- Apply Phase 18C migrations in order (run in Supabase SQL editor or psql).
\i supabase/migrations/20260923000001_sale_fulfillments.sql
\i supabase/migrations/20260923000002_phase18c_rls_and_inventory_admin.sql
\i supabase/migrations/20260923000003_print_jobs_and_rpc.sql
\i supabase/migrations/20260923000004_complete_sale_print_jobs.sql
