-- One-time setup for ABIQ Marks in the Snowflake trial account. Run in Snowsight as ACCOUNTADMIN.
-- After this, `synth load --target snowflake` (run as TIQ_SERVICE / GEN_LOADER) creates the schemas and tables.

USE ROLE ACCOUNTADMIN;

-- Option B only: wipe the earlier project's database first. This deletes AB_SYNTH and all its tables
-- (DEALCLOUD, EVEREST, MAPPING, MARKS, SENTRY). Uncomment only if you are sure.
-- DROP DATABASE IF EXISTS AB_SYNTH;

-- New database for this project, owned by the loader role so it can create schemas, tables and views.
CREATE DATABASE IF NOT EXISTS TIQ_POC;
GRANT OWNERSHIP ON DATABASE TIQ_POC TO ROLE GEN_LOADER COPY CURRENT GRANTS;

-- X-Small warehouse with 60-second auto-suspend (CLAUDE.md: protect trial credits).
ALTER WAREHOUSE TIQ_XS SET WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE;
GRANT USAGE, OPERATE ON WAREHOUSE TIQ_XS TO ROLE GEN_LOADER;

-- Credit cap for the trial (adjust the quota as you like).
CREATE RESOURCE MONITOR IF NOT EXISTS TIQ_POC_MONITOR WITH CREDIT_QUOTA = 20
  TRIGGERS ON 80 PERCENT DO NOTIFY ON 100 PERCENT DO SUSPEND;
ALTER WAREHOUSE TIQ_XS SET RESOURCE_MONITOR = TIQ_POC_MONITOR;
