-- Starter instrument catalogue across major markets. More are added by import/broker sync.
-- contract_size = units per 1 quantity entered: FX standard lot 100,000; index/stock CFDs 1;
-- NSE index derivatives use the current exchange lot size and must be kept in sync with NSE circulars.
INSERT INTO instrument (exchange, symbol, display_name, asset_class, quote_currency, contract_size, tick_size, session_tz) VALUES
  -- India (NSE)
  ('XNSE','NIFTY','Nifty 50','index','INR',75,0.05,'Asia/Kolkata'),
  ('XNSE','BANKNIFTY','Nifty Bank','index','INR',35,0.05,'Asia/Kolkata'),
  ('XNSE','RELIANCE','Reliance Industries','equity','INR',1,0.05,'Asia/Kolkata'),
  ('XNSE','HDFCBANK','HDFC Bank','equity','INR',1,0.05,'Asia/Kolkata'),
  ('XNSE','INFY','Infosys','equity','INR',1,0.05,'Asia/Kolkata'),
  ('XNSE','TCS','Tata Consultancy Services','equity','INR',1,0.05,'Asia/Kolkata'),
  -- United States
  ('XNAS','AAPL','Apple','equity','USD',1,0.01,'America/New_York'),
  ('XNAS','NVDA','NVIDIA','equity','USD',1,0.01,'America/New_York'),
  ('XNAS','TSLA','Tesla','equity','USD',1,0.01,'America/New_York'),
  ('XNAS','QQQ','Invesco QQQ Trust','equity','USD',1,0.01,'America/New_York'),
  ('ARCX','SPY','SPDR S&P 500 ETF','equity','USD',1,0.01,'America/New_York'),
  ('XCME','ES','E-mini S&P 500','future','USD',50,0.25,'America/Chicago'),
  ('XCME','NQ','E-mini Nasdaq-100','future','USD',20,0.25,'America/Chicago'),
  -- CFDs commonly traded at prop firms
  ('CFD','NAS100','Nasdaq 100 CFD','cfd','USD',1,0.1,'America/New_York'),
  ('CFD','US30','Dow Jones 30 CFD','cfd','USD',1,0.1,'America/New_York'),
  ('CFD','GER40','DAX 40 CFD','cfd','EUR',1,0.1,'Europe/Berlin'),
  ('CFD','UK100','FTSE 100 CFD','cfd','GBP',1,0.1,'Europe/London'),
  -- Spot FX
  ('FX','EURUSD','EUR/USD','forex','USD',100000,0.00001,'Etc/UTC'),
  ('FX','GBPUSD','GBP/USD','forex','USD',100000,0.00001,'Etc/UTC'),
  ('FX','USDJPY','USD/JPY','forex','JPY',100000,0.001,'Etc/UTC'),
  ('FX','GBPJPY','GBP/JPY','forex','JPY',100000,0.001,'Etc/UTC'),
  ('FX','AUDUSD','AUD/USD','forex','USD',100000,0.00001,'Etc/UTC'),
  ('FX','USDINR','USD/INR','forex','INR',1000,0.0025,'Asia/Kolkata'),
  ('FX','XAUUSD','Gold spot','commodity','USD',100,0.01,'Etc/UTC'),
  -- Europe / Asia equities
  ('XLON','HSBA','HSBC Holdings','equity','GBP',1,0.1,'Europe/London'),
  ('XETR','SAP','SAP','equity','EUR',1,0.01,'Europe/Berlin'),
  ('XTKS','7203','Toyota Motor','equity','JPY',1,1,'Asia/Tokyo'),
  -- Crypto
  ('CRYPTO','BTCUSD','Bitcoin','crypto','USD',1,0.01,'Etc/UTC'),
  ('CRYPTO','ETHUSD','Ether','crypto','USD',1,0.01,'Etc/UTC')
ON CONFLICT (exchange, symbol) DO NOTHING;
