-- ABIQ Marks: full setup for a NEW Snowflake account. Run once in Snowsight as ACCOUNTADMIN
-- (select All, then Run). It creates everything the app needs; the data is loaded afterwards by
-- python -m synth.cli load --target snowflake
-- The public key below is this project's existing key, so the private key in .secrets keeps working.

USE ROLE ACCOUNTADMIN;

-- role the app loads and reads with
CREATE ROLE IF NOT EXISTS GEN_LOADER;
GRANT ROLE GEN_LOADER TO ROLE SYSADMIN;

-- X-Small warehouse, suspends after 60 seconds idle to save credits
CREATE WAREHOUSE IF NOT EXISTS TIQ_XS WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE;
GRANT USAGE, OPERATE ON WAREHOUSE TIQ_XS TO ROLE GEN_LOADER;

-- database, owned by the loader role so it can create schemas and tables
CREATE DATABASE IF NOT EXISTS TIQ_POC;
GRANT OWNERSHIP ON DATABASE TIQ_POC TO ROLE GEN_LOADER COPY CURRENT GRANTS;

-- service user, key-pair login only (no password)
CREATE USER IF NOT EXISTS TIQ_SERVICE
  TYPE = SERVICE
  DEFAULT_ROLE = GEN_LOADER
  DEFAULT_WAREHOUSE = TIQ_XS
  DEFAULT_NAMESPACE = TIQ_POC
  COMMENT = 'ABIQ Marks app';
ALTER USER TIQ_SERVICE SET RSA_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz8Jdpt3FgpUozIgnUcqHyfEnda6sVbwMuM5+2weBBO2x9mBg6DfwsR0b6H78tZ5rsXN7QLpQHWpVFO5yRdcnvDYdpnB329grEpbqX7PitUEDotkpk8irovrAWTJK2sPeZQ4Zi5bfgypqur3ClBK3cx9xc/ISc0mqWpVTIHg4w3R7A13XEe/aMXmr3YXjTJr12n5D+I5yY0Re1xcrhHlW0N0dspIixQWM7bq6D2GtnqGLGA38ni3mkZ9F8BrR9TYvDObxaCJq9aiqVJ8Yhhq63R4zsslL5jzj9yEV5JrMgkrE7JJyhQS2JDFKODYk6rrin609IMKiHygHW/jMXXthJQIDAQAB';
GRANT ROLE GEN_LOADER TO USER TIQ_SERVICE;

-- credit cap: notify at 80 percent, suspend at 100 percent
CREATE RESOURCE MONITOR IF NOT EXISTS TIQ_POC_MONITOR WITH CREDIT_QUOTA = 20
  TRIGGERS ON 80 PERCENT DO NOTIFY ON 100 PERCENT DO SUSPEND;
ALTER WAREHOUSE TIQ_XS SET RESOURCE_MONITOR = TIQ_POC_MONITOR;

-- the account identifier to put in .env as SNOWFLAKE_ACCOUNT (format ORGNAME-ACCOUNTNAME)
SELECT CURRENT_ORGANIZATION_NAME() || '-' || CURRENT_ACCOUNT_NAME() AS SNOWFLAKE_ACCOUNT;
