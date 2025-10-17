-- Update constraints to ensure portfolio allocations always sum to 100%
-- This script adds a check constraint to ensure the sum of target_percentage equals 100%

-- First, update the existing default coins to sum to 100%
UPDATE default_coins SET target_percentage = 
  CASE 
    WHEN coin_symbol = 'ENAUSDT' THEN 12.50
    WHEN coin_symbol = 'TAOUSDT' THEN 12.50
    WHEN coin_symbol = 'SUIUSDT' THEN 12.50
    WHEN coin_symbol = 'UNIUSDT' THEN 15.00
    WHEN coin_symbol = 'APTUSDT' THEN 15.00
    WHEN coin_symbol = 'AVAXUSDT' THEN 15.00
    WHEN coin_symbol = 'PUMPUSDT' THEN 10.00
    WHEN coin_symbol = 'SOLUSDT' THEN 7.50
    ELSE target_percentage
  END
WHERE is_active = true;

-- Add a function to validate that active coins sum to 100%
CREATE OR REPLACE FUNCTION validate_portfolio_100_percent()
RETURNS TRIGGER AS $$
DECLARE
    total_percent NUMERIC;
BEGIN
    -- Calculate total percentage of active coins
    SELECT SUM(target_percentage) INTO total_percent
    FROM default_coins
    WHERE is_active = true;
    
    -- Check if total equals 100%
    IF total_percent != 100.00 THEN
        RAISE EXCEPTION 'Portfolio allocation must sum to exactly 100%%, current total: %%', total_percent;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate on any change to default_coins
DROP TRIGGER IF EXISTS trigger_validate_portfolio_100_percent ON default_coins;
CREATE TRIGGER trigger_validate_portfolio_100_percent
    AFTER INSERT OR UPDATE OR DELETE ON default_coins
    FOR EACH STATEMENT
    EXECUTE FUNCTION validate_portfolio_100_percent();

-- Verify the current data sums to 100%
DO $$
DECLARE
    total_percent NUMERIC;
BEGIN
    SELECT SUM(target_percentage) INTO total_percent
    FROM default_coins
    WHERE is_active = true;
    
    IF total_percent = 100.00 THEN
        RAISE NOTICE 'Portfolio allocation successfully updated to 100%%';
    ELSE
        RAISE EXCEPTION 'Portfolio allocation update failed. Current total: %%', total_percent;
    END IF;
END $$;
