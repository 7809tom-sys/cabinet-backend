-- Merge B12 (9360002) into B-12 (9390002)
UPDATE distributor_skus SET cabinetId = 9390002 WHERE cabinetId = 9360002;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390002 WHERE cabinetId = 9360002;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360002;
UPDATE cabinets SET altSku1 = 'B12' WHERE id = 9390002 AND altSku1 IS NULL;

-- Merge B18 (9360004) into B-18 (9390004)
UPDATE distributor_skus SET cabinetId = 9390004 WHERE cabinetId = 9360004;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390004 WHERE cabinetId = 9360004;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360004;
UPDATE cabinets SET altSku1 = 'B18' WHERE id = 9390004 AND altSku1 IS NULL;

-- Merge B21 (9360005) into B-21 (9390005)
UPDATE distributor_skus SET cabinetId = 9390005 WHERE cabinetId = 9360005;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390005 WHERE cabinetId = 9360005;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360005;
UPDATE cabinets SET altSku1 = 'B21' WHERE id = 9390005 AND altSku1 IS NULL;

-- Merge B24 (9360006) into B-24 (9390006)
UPDATE distributor_skus SET cabinetId = 9390006 WHERE cabinetId = 9360006;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390006 WHERE cabinetId = 9360006;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360006;
UPDATE cabinets SET altSku1 = 'B24' WHERE id = 9390006 AND altSku1 IS NULL;

-- Merge B27 (9360007) into B-27 (9390007)
UPDATE distributor_skus SET cabinetId = 9390007 WHERE cabinetId = 9360007;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390007 WHERE cabinetId = 9360007;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360007;
UPDATE cabinets SET altSku1 = 'B27' WHERE id = 9390007 AND altSku1 IS NULL;

-- Merge B30 (9360008) into B-30 (9390008)
UPDATE distributor_skus SET cabinetId = 9390008 WHERE cabinetId = 9360008;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390008 WHERE cabinetId = 9360008;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360008;
UPDATE cabinets SET altSku1 = 'B30' WHERE id = 9390008 AND altSku1 IS NULL;

-- Merge B30S (9390211) into B-30 (9390008)
UPDATE distributor_skus SET cabinetId = 9390008 WHERE cabinetId = 9390211;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390008 WHERE cabinetId = 9390211;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9390211;
UPDATE cabinets SET altSku1 = 'B30S' WHERE id = 9390008 AND altSku1 IS NULL;

-- Merge B33 (9360009) into B-33 (9390009)
UPDATE distributor_skus SET cabinetId = 9390009 WHERE cabinetId = 9360009;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390009 WHERE cabinetId = 9360009;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360009;
UPDATE cabinets SET altSku1 = 'B33' WHERE id = 9390009 AND altSku1 IS NULL;

-- Merge B36 (9360010) into B-36 (9390010)
UPDATE distributor_skus SET cabinetId = 9390010 WHERE cabinetId = 9360010;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390010 WHERE cabinetId = 9360010;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360010;
UPDATE cabinets SET altSku1 = 'B36' WHERE id = 9390010 AND altSku1 IS NULL;

-- Merge B-39 (9390011) into B39 (9390216)
UPDATE distributor_skus SET cabinetId = 9390216 WHERE cabinetId = 9390011;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390216 WHERE cabinetId = 9390011;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9390011;
UPDATE cabinets SET altSku1 = 'B-39' WHERE id = 9390216 AND altSku1 IS NULL;

-- Merge B42 (9360011) into B-42 (9390012)
UPDATE distributor_skus SET cabinetId = 9390012 WHERE cabinetId = 9360011;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390012 WHERE cabinetId = 9360011;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360011;
UPDATE cabinets SET altSku1 = 'B42' WHERE id = 9390012 AND altSku1 IS NULL;

-- Merge BBC36 (9360043) into BBC-36 (9390015)
UPDATE distributor_skus SET cabinetId = 9390015 WHERE cabinetId = 9360043;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390015 WHERE cabinetId = 9360043;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360043;
UPDATE cabinets SET altSku1 = 'BBC36' WHERE id = 9390015 AND altSku1 IS NULL;

-- Merge 3DB12 (9360024) into DB-12-3 (9390028)
UPDATE distributor_skus SET cabinetId = 9390028 WHERE cabinetId = 9360024;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390028 WHERE cabinetId = 9360024;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360024;
UPDATE cabinets SET altSku1 = '3DB12' WHERE id = 9390028 AND altSku1 IS NULL;

-- Merge 3DB15 (9360025) into BD-15-3 (9390029)
UPDATE distributor_skus SET cabinetId = 9390029 WHERE cabinetId = 9360025;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390029 WHERE cabinetId = 9360025;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360025;
UPDATE cabinets SET altSku1 = '3DB15' WHERE id = 9390029 AND altSku1 IS NULL;

-- Merge 3DB18 (9360026) into DB-18-3 (9390030)
UPDATE distributor_skus SET cabinetId = 9390030 WHERE cabinetId = 9360026;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390030 WHERE cabinetId = 9360026;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360026;
UPDATE cabinets SET altSku1 = '3DB18' WHERE id = 9390030 AND altSku1 IS NULL;

-- Merge 3DB21 (9360027) into DB-21-3 (9390031)
UPDATE distributor_skus SET cabinetId = 9390031 WHERE cabinetId = 9360027;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390031 WHERE cabinetId = 9360027;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360027;
UPDATE cabinets SET altSku1 = '3DB21' WHERE id = 9390031 AND altSku1 IS NULL;

-- Merge 3DB24 (9360028) into DB-24-3 (9390032)
UPDATE distributor_skus SET cabinetId = 9390032 WHERE cabinetId = 9360028;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390032 WHERE cabinetId = 9360028;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360028;
UPDATE cabinets SET altSku1 = '3DB24' WHERE id = 9390032 AND altSku1 IS NULL;

-- Merge 3DB30 (9360031) into DB-30-3 (9390033)
UPDATE distributor_skus SET cabinetId = 9390033 WHERE cabinetId = 9360031;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390033 WHERE cabinetId = 9360031;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360031;
UPDATE cabinets SET altSku1 = '3DB30' WHERE id = 9390033 AND altSku1 IS NULL;

-- Merge 3DB36 (9360032) into DB-36-3 (9390034)
UPDATE distributor_skus SET cabinetId = 9390034 WHERE cabinetId = 9360032;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390034 WHERE cabinetId = 9360032;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360032;
UPDATE cabinets SET altSku1 = '3DB36' WHERE id = 9390034 AND altSku1 IS NULL;

-- Merge FSB36 (9360037) into FSB-36 (9390043)
UPDATE distributor_skus SET cabinetId = 9390043 WHERE cabinetId = 9360037;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390043 WHERE cabinetId = 9360037;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360037;
UPDATE cabinets SET altSku1 = 'FSB36' WHERE id = 9390043 AND altSku1 IS NULL;

-- Merge LRM8 (9360220) into LRM-8 (9390047)
UPDATE distributor_skus SET cabinetId = 9390047 WHERE cabinetId = 9360220;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390047 WHERE cabinetId = 9360220;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360220;
UPDATE cabinets SET altSku1 = 'LRM8' WHERE id = 9390047 AND altSku1 IS NULL;

-- Merge PR3015 (9360165) into PR-30-15 (9390058)
UPDATE distributor_skus SET cabinetId = 9390058 WHERE cabinetId = 9360165;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390058 WHERE cabinetId = 9360165;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360165;
UPDATE cabinets SET altSku1 = 'PR3015' WHERE id = 9390058 AND altSku1 IS NULL;

-- Merge SB33 (9360035) into SB-33 (9390063)
UPDATE distributor_skus SET cabinetId = 9390063 WHERE cabinetId = 9360035;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390063 WHERE cabinetId = 9360035;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360035;
UPDATE cabinets SET altSku1 = 'SB33' WHERE id = 9390063 AND altSku1 IS NULL;

-- Merge SB36 (9360036) into SB-36 (9390064)
UPDATE distributor_skus SET cabinetId = 9390064 WHERE cabinetId = 9360036;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390064 WHERE cabinetId = 9360036;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360036;
UPDATE cabinets SET altSku1 = 'SB36' WHERE id = 9390064 AND altSku1 IS NULL;

-- Merge SM8(SCR) (9360228) into SM-8 (9390068)
UPDATE distributor_skus SET cabinetId = 9390068 WHERE cabinetId = 9360228;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390068 WHERE cabinetId = 9360228;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360228;
UPDATE cabinets SET altSku1 = 'SM8(SCR)' WHERE id = 9390068 AND altSku1 IS NULL;

-- Merge TKC (9360200) into TK-8 (9390073)
UPDATE distributor_skus SET cabinetId = 9390073 WHERE cabinetId = 9360200;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390073 WHERE cabinetId = 9360200;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360200;
UPDATE cabinets SET altSku1 = 'TKC' WHERE id = 9390073 AND altSku1 IS NULL;

-- Merge U188424 (9360171) into U-18-84-24 (9390075)
UPDATE distributor_skus SET cabinetId = 9390075 WHERE cabinetId = 9360171;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390075 WHERE cabinetId = 9360171;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360171;
UPDATE cabinets SET altSku1 = 'U188424' WHERE id = 9390075 AND altSku1 IS NULL;

-- Merge U189024 (9360173) into U-18-90-24 (9390076)
UPDATE distributor_skus SET cabinetId = 9390076 WHERE cabinetId = 9360173;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390076 WHERE cabinetId = 9360173;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360173;
UPDATE cabinets SET altSku1 = 'U189024' WHERE id = 9390076 AND altSku1 IS NULL;

-- Merge U189624 (9360175) into U-18-96-24 (9390077)
UPDATE distributor_skus SET cabinetId = 9390077 WHERE cabinetId = 9360175;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390077 WHERE cabinetId = 9360175;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360175;
UPDATE cabinets SET altSku1 = 'U189624' WHERE id = 9390077 AND altSku1 IS NULL;

-- Merge U248424 (9360176) into U-24-84-24 (9390078)
UPDATE distributor_skus SET cabinetId = 9390078 WHERE cabinetId = 9360176;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390078 WHERE cabinetId = 9360176;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360176;
UPDATE cabinets SET altSku1 = 'U248424' WHERE id = 9390078 AND altSku1 IS NULL;

-- Merge U249024 (9360177) into U-24-90-24 (9390079)
UPDATE distributor_skus SET cabinetId = 9390079 WHERE cabinetId = 9360177;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390079 WHERE cabinetId = 9360177;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360177;
UPDATE cabinets SET altSku1 = 'U249024' WHERE id = 9390079 AND altSku1 IS NULL;

-- Merge U249624 (9360178) into U-24-96-24 (9390080)
UPDATE distributor_skus SET cabinetId = 9390080 WHERE cabinetId = 9360178;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390080 WHERE cabinetId = 9360178;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360178;
UPDATE cabinets SET altSku1 = 'U249624' WHERE id = 9390080 AND altSku1 IS NULL;

-- Merge V3021DL (9360257) into V-30-21DL (9390092)
UPDATE distributor_skus SET cabinetId = 9390092 WHERE cabinetId = 9360257;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390092 WHERE cabinetId = 9360257;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360257;
UPDATE cabinets SET altSku1 = 'V3021DL' WHERE id = 9390092 AND altSku1 IS NULL;

-- Merge V3021DR (9360258) into V-30-21DR (9390093)
UPDATE distributor_skus SET cabinetId = 9390093 WHERE cabinetId = 9360258;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390093 WHERE cabinetId = 9360258;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360258;
UPDATE cabinets SET altSku1 = 'V3021DR' WHERE id = 9390093 AND altSku1 IS NULL;

-- Merge V3621DL (9360261) into V-36-21DL (9390095)
UPDATE distributor_skus SET cabinetId = 9390095 WHERE cabinetId = 9360261;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390095 WHERE cabinetId = 9360261;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360261;
UPDATE cabinets SET altSku1 = 'V3621DL' WHERE id = 9390095 AND altSku1 IS NULL;

-- Merge V3621DR (9360262) into V-36-21DR (9390096)
UPDATE distributor_skus SET cabinetId = 9390096 WHERE cabinetId = 9360262;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390096 WHERE cabinetId = 9360262;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360262;
UPDATE cabinets SET altSku1 = 'V3621DR' WHERE id = 9390096 AND altSku1 IS NULL;

-- Merge VA48 (9360237) into VA-48 (9390099)
UPDATE distributor_skus SET cabinetId = 9390099 WHERE cabinetId = 9360237;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390099 WHERE cabinetId = 9360237;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360237;
UPDATE cabinets SET altSku1 = 'VA48' WHERE id = 9390099 AND altSku1 IS NULL;

-- Merge W0930 (9360054) into W-09-30 (9390106)
UPDATE distributor_skus SET cabinetId = 9390106 WHERE cabinetId = 9360054;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390106 WHERE cabinetId = 9360054;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360054;
UPDATE cabinets SET altSku1 = 'W0930' WHERE id = 9390106 AND altSku1 IS NULL;

-- Merge W0936 (9360065) into W-09-36 (9390107)
UPDATE distributor_skus SET cabinetId = 9390107 WHERE cabinetId = 9360065;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390107 WHERE cabinetId = 9360065;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360065;
UPDATE cabinets SET altSku1 = 'W0936' WHERE id = 9390107 AND altSku1 IS NULL;

-- Merge W0942 (9360075) into W-09-42 (9390108)
UPDATE distributor_skus SET cabinetId = 9390108 WHERE cabinetId = 9360075;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390108 WHERE cabinetId = 9360075;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360075;
UPDATE cabinets SET altSku1 = 'W0942' WHERE id = 9390108 AND altSku1 IS NULL;

-- Merge W1230 (9360055) into W-12-30 (9390110)
UPDATE distributor_skus SET cabinetId = 9390110 WHERE cabinetId = 9360055;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390110 WHERE cabinetId = 9360055;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360055;
UPDATE cabinets SET altSku1 = 'W1230' WHERE id = 9390110 AND altSku1 IS NULL;

-- Merge W1236 (9360066) into W-12-36 (9390111)
UPDATE distributor_skus SET cabinetId = 9390111 WHERE cabinetId = 9360066;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390111 WHERE cabinetId = 9360066;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360066;
UPDATE cabinets SET altSku1 = 'W1236' WHERE id = 9390111 AND altSku1 IS NULL;

-- Merge W1242 (9360076) into W-12-42 (9390112)
UPDATE distributor_skus SET cabinetId = 9390112 WHERE cabinetId = 9360076;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390112 WHERE cabinetId = 9360076;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360076;
UPDATE cabinets SET altSku1 = 'W1242' WHERE id = 9390112 AND altSku1 IS NULL;

-- Merge W1530 (9360056) into W-15-30 (9390114)
UPDATE distributor_skus SET cabinetId = 9390114 WHERE cabinetId = 9360056;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390114 WHERE cabinetId = 9360056;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360056;
UPDATE cabinets SET altSku1 = 'W1530' WHERE id = 9390114 AND altSku1 IS NULL;

-- Merge W1536 (9360067) into W-15-36 (9390115)
UPDATE distributor_skus SET cabinetId = 9390115 WHERE cabinetId = 9360067;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390115 WHERE cabinetId = 9360067;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360067;
UPDATE cabinets SET altSku1 = 'W1536' WHERE id = 9390115 AND altSku1 IS NULL;

-- Merge W1542 (9360077) into W-15-42 (9390116)
UPDATE distributor_skus SET cabinetId = 9390116 WHERE cabinetId = 9360077;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390116 WHERE cabinetId = 9360077;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360077;
UPDATE cabinets SET altSku1 = 'W1542' WHERE id = 9390116 AND altSku1 IS NULL;

-- Merge W1830 (9360057) into W-18-30 (9390118)
UPDATE distributor_skus SET cabinetId = 9390118 WHERE cabinetId = 9360057;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390118 WHERE cabinetId = 9360057;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360057;
UPDATE cabinets SET altSku1 = 'W1830' WHERE id = 9390118 AND altSku1 IS NULL;

-- Merge W1836 (9360068) into W-18-36 (9390119)
UPDATE distributor_skus SET cabinetId = 9390119 WHERE cabinetId = 9360068;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390119 WHERE cabinetId = 9360068;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360068;
UPDATE cabinets SET altSku1 = 'W1836' WHERE id = 9390119 AND altSku1 IS NULL;

-- Merge W1842 (9360078) into W-18-42 (9390120)
UPDATE distributor_skus SET cabinetId = 9390120 WHERE cabinetId = 9360078;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390120 WHERE cabinetId = 9360078;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360078;
UPDATE cabinets SET altSku1 = 'W1842' WHERE id = 9390120 AND altSku1 IS NULL;

-- Merge W2130 (9360058) into W-21-30 (9390122)
UPDATE distributor_skus SET cabinetId = 9390122 WHERE cabinetId = 9360058;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390122 WHERE cabinetId = 9360058;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360058;
UPDATE cabinets SET altSku1 = 'W2130' WHERE id = 9390122 AND altSku1 IS NULL;

-- Merge W2136 (9360069) into W-21-36 (9390123)
UPDATE distributor_skus SET cabinetId = 9390123 WHERE cabinetId = 9360069;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390123 WHERE cabinetId = 9360069;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360069;
UPDATE cabinets SET altSku1 = 'W2136' WHERE id = 9390123 AND altSku1 IS NULL;

-- Merge W2142 (9360079) into W-21-42 (9390124)
UPDATE distributor_skus SET cabinetId = 9390124 WHERE cabinetId = 9360079;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390124 WHERE cabinetId = 9360079;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360079;
UPDATE cabinets SET altSku1 = 'W2142' WHERE id = 9390124 AND altSku1 IS NULL;

-- Merge W2430 (9360059) into W-24-30 (9390126)
UPDATE distributor_skus SET cabinetId = 9390126 WHERE cabinetId = 9360059;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390126 WHERE cabinetId = 9360059;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360059;
UPDATE cabinets SET altSku1 = 'W2430' WHERE id = 9390126 AND altSku1 IS NULL;

-- Merge W2436 (9360070) into W-24-36 (9390127)
UPDATE distributor_skus SET cabinetId = 9390127 WHERE cabinetId = 9360070;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390127 WHERE cabinetId = 9360070;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360070;
UPDATE cabinets SET altSku1 = 'W2436' WHERE id = 9390127 AND altSku1 IS NULL;

-- Merge W2442 (9360080) into W-24-42 (9390128)
UPDATE distributor_skus SET cabinetId = 9390128 WHERE cabinetId = 9360080;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390128 WHERE cabinetId = 9360080;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360080;
UPDATE cabinets SET altSku1 = 'W2442' WHERE id = 9390128 AND altSku1 IS NULL;

-- Merge W2730 (9360060) into W-27-30 (9390130)
UPDATE distributor_skus SET cabinetId = 9390130 WHERE cabinetId = 9360060;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390130 WHERE cabinetId = 9360060;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360060;
UPDATE cabinets SET altSku1 = 'W2730' WHERE id = 9390130 AND altSku1 IS NULL;

-- Merge W2736 (9360071) into W-27-36 (9390131)
UPDATE distributor_skus SET cabinetId = 9390131 WHERE cabinetId = 9360071;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390131 WHERE cabinetId = 9360071;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360071;
UPDATE cabinets SET altSku1 = 'W2736' WHERE id = 9390131 AND altSku1 IS NULL;

-- Merge W2742 (9360081) into W-27-42 (9390132)
UPDATE distributor_skus SET cabinetId = 9390132 WHERE cabinetId = 9360081;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390132 WHERE cabinetId = 9360081;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360081;
UPDATE cabinets SET altSku1 = 'W2742' WHERE id = 9390132 AND altSku1 IS NULL;

-- Merge W3012 (9360085) into W-30-12 (9390133)
UPDATE distributor_skus SET cabinetId = 9390133 WHERE cabinetId = 9360085;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390133 WHERE cabinetId = 9360085;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360085;
UPDATE cabinets SET altSku1 = 'W3012' WHERE id = 9390133 AND altSku1 IS NULL;

-- Merge W3015 (9360088) into W-30-15 (9390135)
UPDATE distributor_skus SET cabinetId = 9390135 WHERE cabinetId = 9360088;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390135 WHERE cabinetId = 9360088;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360088;
UPDATE cabinets SET altSku1 = 'W3015' WHERE id = 9390135 AND altSku1 IS NULL;

-- Merge W3018 (9360092) into W-30-18 (9390136)
UPDATE distributor_skus SET cabinetId = 9390136 WHERE cabinetId = 9360092;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390136 WHERE cabinetId = 9360092;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360092;
UPDATE cabinets SET altSku1 = 'W3018' WHERE id = 9390136 AND altSku1 IS NULL;

-- Merge W3024 (9360095) into W-30-24 (9390138)
UPDATE distributor_skus SET cabinetId = 9390138 WHERE cabinetId = 9360095;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390138 WHERE cabinetId = 9360095;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360095;
UPDATE cabinets SET altSku1 = 'W3024' WHERE id = 9390138 AND altSku1 IS NULL;

-- Merge W3030 (9360061) into W-30-30 (9390139)
UPDATE distributor_skus SET cabinetId = 9390139 WHERE cabinetId = 9360061;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390139 WHERE cabinetId = 9360061;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360061;
UPDATE cabinets SET altSku1 = 'W3030' WHERE id = 9390139 AND altSku1 IS NULL;

-- Merge W3036 (9360072) into W-30-36 (9390140)
UPDATE distributor_skus SET cabinetId = 9390140 WHERE cabinetId = 9360072;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390140 WHERE cabinetId = 9360072;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360072;
UPDATE cabinets SET altSku1 = 'W3036' WHERE id = 9390140 AND altSku1 IS NULL;

-- Merge W3042 (9360082) into W-30-42 (9390141)
UPDATE distributor_skus SET cabinetId = 9390141 WHERE cabinetId = 9360082;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390141 WHERE cabinetId = 9360082;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360082;
UPDATE cabinets SET altSku1 = 'W3042' WHERE id = 9390141 AND altSku1 IS NULL;

-- Merge W3312 (9360086) into W-33-12 (9390142)
UPDATE distributor_skus SET cabinetId = 9390142 WHERE cabinetId = 9360086;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390142 WHERE cabinetId = 9360086;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360086;
UPDATE cabinets SET altSku1 = 'W3312' WHERE id = 9390142 AND altSku1 IS NULL;

-- Merge W3315 (9360089) into W-33-15 (9390144)
UPDATE distributor_skus SET cabinetId = 9390144 WHERE cabinetId = 9360089;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390144 WHERE cabinetId = 9360089;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360089;
UPDATE cabinets SET altSku1 = 'W3315' WHERE id = 9390144 AND altSku1 IS NULL;

-- Merge W3318 (9360093) into W-33-18 (9390145)
UPDATE distributor_skus SET cabinetId = 9390145 WHERE cabinetId = 9360093;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390145 WHERE cabinetId = 9360093;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360093;
UPDATE cabinets SET altSku1 = 'W3318' WHERE id = 9390145 AND altSku1 IS NULL;

-- Merge W3324 (9360096) into W-33-24 (9390147)
UPDATE distributor_skus SET cabinetId = 9390147 WHERE cabinetId = 9360096;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390147 WHERE cabinetId = 9360096;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360096;
UPDATE cabinets SET altSku1 = 'W3324' WHERE id = 9390147 AND altSku1 IS NULL;

-- Merge W3330 (9360062) into W-33-30 (9390148)
UPDATE distributor_skus SET cabinetId = 9390148 WHERE cabinetId = 9360062;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390148 WHERE cabinetId = 9360062;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360062;
UPDATE cabinets SET altSku1 = 'W3330' WHERE id = 9390148 AND altSku1 IS NULL;

-- Merge W3336 (9360073) into W-33-36 (9390149)
UPDATE distributor_skus SET cabinetId = 9390149 WHERE cabinetId = 9360073;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390149 WHERE cabinetId = 9360073;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360073;
UPDATE cabinets SET altSku1 = 'W3336' WHERE id = 9390149 AND altSku1 IS NULL;

-- Merge W3342 (9360083) into W-33-42 (9390150)
UPDATE distributor_skus SET cabinetId = 9390150 WHERE cabinetId = 9360083;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390150 WHERE cabinetId = 9360083;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360083;
UPDATE cabinets SET altSku1 = 'W3342' WHERE id = 9390150 AND altSku1 IS NULL;

-- Merge W3612 (9360087) into W-36-12 (9390151)
UPDATE distributor_skus SET cabinetId = 9390151 WHERE cabinetId = 9360087;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390151 WHERE cabinetId = 9360087;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360087;
UPDATE cabinets SET altSku1 = 'W3612' WHERE id = 9390151 AND altSku1 IS NULL;

-- Merge W3615 (9360090) into W-36-15 (9390153)
UPDATE distributor_skus SET cabinetId = 9390153 WHERE cabinetId = 9360090;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390153 WHERE cabinetId = 9360090;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360090;
UPDATE cabinets SET altSku1 = 'W3615' WHERE id = 9390153 AND altSku1 IS NULL;

-- Merge W3618 (9360094) into W-36-18 (9390154)
UPDATE distributor_skus SET cabinetId = 9390154 WHERE cabinetId = 9360094;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390154 WHERE cabinetId = 9360094;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360094;
UPDATE cabinets SET altSku1 = 'W3618' WHERE id = 9390154 AND altSku1 IS NULL;

-- Merge W3624 (9360097) into W-36-24 (9390156)
UPDATE distributor_skus SET cabinetId = 9390156 WHERE cabinetId = 9360097;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390156 WHERE cabinetId = 9360097;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360097;
UPDATE cabinets SET altSku1 = 'W3624' WHERE id = 9390156 AND altSku1 IS NULL;

-- Merge W3630 (9360063) into W-36-30 (9390157)
UPDATE distributor_skus SET cabinetId = 9390157 WHERE cabinetId = 9360063;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390157 WHERE cabinetId = 9360063;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360063;
UPDATE cabinets SET altSku1 = 'W3630' WHERE id = 9390157 AND altSku1 IS NULL;

-- Merge W3636 (9360074) into W-36-36 (9390158)
UPDATE distributor_skus SET cabinetId = 9390158 WHERE cabinetId = 9360074;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390158 WHERE cabinetId = 9360074;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360074;
UPDATE cabinets SET altSku1 = 'W3636' WHERE id = 9390158 AND altSku1 IS NULL;

-- Merge W3642 (9360084) into W-36-42 (9390159)
UPDATE distributor_skus SET cabinetId = 9390159 WHERE cabinetId = 9360084;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390159 WHERE cabinetId = 9360084;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360084;
UPDATE cabinets SET altSku1 = 'W3642' WHERE id = 9390159 AND altSku1 IS NULL;

-- Merge W3930 (9360064) into W-39-30 (9390160)
UPDATE distributor_skus SET cabinetId = 9390160 WHERE cabinetId = 9360064;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390160 WHERE cabinetId = 9360064;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360064;
UPDATE cabinets SET altSku1 = 'W3930' WHERE id = 9390160 AND altSku1 IS NULL;

-- Merge WBC2730 (9360136) into WBC-27-30 (9390166)
UPDATE distributor_skus SET cabinetId = 9390166 WHERE cabinetId = 9360136;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390166 WHERE cabinetId = 9360136;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360136;
UPDATE cabinets SET altSku1 = 'WBC2730' WHERE id = 9390166 AND altSku1 IS NULL;

-- Merge WBC2736 (9360138) into WBC-27-36 (9390167)
UPDATE distributor_skus SET cabinetId = 9390167 WHERE cabinetId = 9360138;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390167 WHERE cabinetId = 9360138;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360138;
UPDATE cabinets SET altSku1 = 'WBC2736' WHERE id = 9390167 AND altSku1 IS NULL;

-- Merge WBC2742 (9360141) into WBC-27-42 (9390168)
UPDATE distributor_skus SET cabinetId = 9390168 WHERE cabinetId = 9360141;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390168 WHERE cabinetId = 9360141;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360141;
UPDATE cabinets SET altSku1 = 'WBC2742' WHERE id = 9390168 AND altSku1 IS NULL;

-- Merge DB-24-2 (9450001) into 2DB24 (9360021)
UPDATE distributor_skus SET cabinetId = 9360021 WHERE cabinetId = 9450001;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360021 WHERE cabinetId = 9450001;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450001;
UPDATE cabinets SET altSku1 = 'DB-24-2' WHERE id = 9360021 AND altSku1 IS NULL;

-- Merge DB-27-3 (9450003) into 3DB27 (9360029)
UPDATE distributor_skus SET cabinetId = 9360029 WHERE cabinetId = 9450003;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360029 WHERE cabinetId = 9450003;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450003;
UPDATE cabinets SET altSku1 = 'DB-27-3' WHERE id = 9360029 AND altSku1 IS NULL;

-- Merge DB-30-2 (9450004) into 2DB30 (9360022)
UPDATE distributor_skus SET cabinetId = 9360022 WHERE cabinetId = 9450004;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360022 WHERE cabinetId = 9450004;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450004;
UPDATE cabinets SET altSku1 = 'DB-30-2' WHERE id = 9360022 AND altSku1 IS NULL;

-- Merge DB-33-3 (9450006) into 3DB33 (9360030)
UPDATE distributor_skus SET cabinetId = 9360030 WHERE cabinetId = 9450006;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360030 WHERE cabinetId = 9450006;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450006;
UPDATE cabinets SET altSku1 = 'DB-33-3' WHERE id = 9360030 AND altSku1 IS NULL;

-- Merge DB-36-2 (9450007) into 2DB36 (9360023)
UPDATE distributor_skus SET cabinetId = 9360023 WHERE cabinetId = 9450007;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360023 WHERE cabinetId = 9450007;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450007;
UPDATE cabinets SET altSku1 = 'DB-36-2' WHERE id = 9360023 AND altSku1 IS NULL;

-- Merge AW-12-30 (9450008) into AW1230 (9360146)
UPDATE distributor_skus SET cabinetId = 9360146 WHERE cabinetId = 9450008;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360146 WHERE cabinetId = 9450008;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450008;
UPDATE cabinets SET altSku1 = 'AW-12-30' WHERE id = 9360146 AND altSku1 IS NULL;

-- Merge AW-12-36 (9450009) into AW1236 (9360147)
UPDATE distributor_skus SET cabinetId = 9360147 WHERE cabinetId = 9450009;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360147 WHERE cabinetId = 9450009;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450009;
UPDATE cabinets SET altSku1 = 'AW-12-36' WHERE id = 9360147 AND altSku1 IS NULL;

-- Merge AW-12-42 (9450010) into AW1242 (9360148)
UPDATE distributor_skus SET cabinetId = 9360148 WHERE cabinetId = 9450010;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360148 WHERE cabinetId = 9450010;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450010;
UPDATE cabinets SET altSku1 = 'AW-12-42' WHERE id = 9360148 AND altSku1 IS NULL;

-- Merge B-12FH (9450011) into B12FH (9390193)
UPDATE distributor_skus SET cabinetId = 9390193 WHERE cabinetId = 9450011;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390193 WHERE cabinetId = 9450011;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450011;
UPDATE cabinets SET altSku1 = 'B-12FH' WHERE id = 9390193 AND altSku1 IS NULL;

-- Merge BFH-27 (9450025) into B-27FH (9450012)
UPDATE distributor_skus SET cabinetId = 9450012 WHERE cabinetId = 9450025;
UPDATE distributor_cabinet_overrides SET cabinetId = 9450012 WHERE cabinetId = 9450025;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450025;
UPDATE cabinets SET altSku1 = 'BFH-27' WHERE id = 9450012 AND altSku1 IS NULL;

-- Merge B-27FH (9450012) into B27FH (9390198)
UPDATE distributor_skus SET cabinetId = 9390198 WHERE cabinetId = 9450012;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390198 WHERE cabinetId = 9450012;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450012;
UPDATE cabinets SET altSku1 = 'B-27FH' WHERE id = 9390198 AND altSku1 IS NULL;

-- Merge BFH-30 (9450026) into B-30FH (9450013)
UPDATE distributor_skus SET cabinetId = 9450013 WHERE cabinetId = 9450026;
UPDATE distributor_cabinet_overrides SET cabinetId = 9450013 WHERE cabinetId = 9450026;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450026;
UPDATE cabinets SET altSku1 = 'BFH-30' WHERE id = 9450013 AND altSku1 IS NULL;

-- Merge B-30FH (9450013) into B30FH (9390199)
UPDATE distributor_skus SET cabinetId = 9390199 WHERE cabinetId = 9450013;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390199 WHERE cabinetId = 9450013;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450013;
UPDATE cabinets SET altSku1 = 'B-30FH' WHERE id = 9390199 AND altSku1 IS NULL;

-- Merge B-33FH (9450014) into B33FH (9390200)
UPDATE distributor_skus SET cabinetId = 9390200 WHERE cabinetId = 9450014;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390200 WHERE cabinetId = 9450014;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450014;
UPDATE cabinets SET altSku1 = 'B-33FH' WHERE id = 9390200 AND altSku1 IS NULL;

-- Merge B-36FH (9450015) into B36FH (9390201)
UPDATE distributor_skus SET cabinetId = 9390201 WHERE cabinetId = 9450015;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390201 WHERE cabinetId = 9450015;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450015;
UPDATE cabinets SET altSku1 = 'B-36FH' WHERE id = 9390201 AND altSku1 IS NULL;

-- Merge BBC-39 (9450019) into BBC39 (9360044)
UPDATE distributor_skus SET cabinetId = 9360044 WHERE cabinetId = 9450019;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360044 WHERE cabinetId = 9450019;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450019;
UPDATE cabinets SET altSku1 = 'BBC-39' WHERE id = 9360044 AND altSku1 IS NULL;

-- Merge BBC-42 (9450020) into BBC42 (9360045)
UPDATE distributor_skus SET cabinetId = 9360045 WHERE cabinetId = 9450020;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360045 WHERE cabinetId = 9450020;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450020;
UPDATE cabinets SET altSku1 = 'BBC-42' WHERE id = 9360045 AND altSku1 IS NULL;

-- Merge BBC-45 (9450021) into BBC45 (9390251)
UPDATE distributor_skus SET cabinetId = 9390251 WHERE cabinetId = 9450021;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390251 WHERE cabinetId = 9450021;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450021;
UPDATE cabinets SET altSku1 = 'BBC-45' WHERE id = 9390251 AND altSku1 IS NULL;

-- Merge BEC-24 (9450022) into BEC24 (9360040)
UPDATE distributor_skus SET cabinetId = 9360040 WHERE cabinetId = 9450022;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360040 WHERE cabinetId = 9450022;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450022;
UPDATE cabinets SET altSku1 = 'BEC-24' WHERE id = 9360040 AND altSku1 IS NULL;

-- Merge BES-12 (9450023) into BES12 (9360046)
UPDATE distributor_skus SET cabinetId = 9360046 WHERE cabinetId = 9450023;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360046 WHERE cabinetId = 9450023;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450023;
UPDATE cabinets SET altSku1 = 'BES-12' WHERE id = 9360046 AND altSku1 IS NULL;

-- Merge BFH-21 (9450024) into BFH21 (9360015)
UPDATE distributor_skus SET cabinetId = 9360015 WHERE cabinetId = 9450024;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360015 WHERE cabinetId = 9450024;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450024;
UPDATE cabinets SET altSku1 = 'BFH-21' WHERE id = 9360015 AND altSku1 IS NULL;

-- Merge BFH-21 (9450024) into B21FH (9390196)
UPDATE distributor_skus SET cabinetId = 9390196 WHERE cabinetId = 9450024;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390196 WHERE cabinetId = 9450024;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450024;
UPDATE cabinets SET altSku1 = 'BFH-21' WHERE id = 9390196 AND altSku1 IS NULL;

-- Merge BFH-27 (9450025) into BFH27 (9360017)
UPDATE distributor_skus SET cabinetId = 9360017 WHERE cabinetId = 9450025;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360017 WHERE cabinetId = 9450025;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450025;
UPDATE cabinets SET altSku1 = 'BFH-27' WHERE id = 9360017 AND altSku1 IS NULL;

-- Merge BFH-27 (9450025) into VS27FH (9390369)
UPDATE distributor_skus SET cabinetId = 9390369 WHERE cabinetId = 9450025;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390369 WHERE cabinetId = 9450025;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450025;
UPDATE cabinets SET altSku1 = 'BFH-27' WHERE id = 9390369 AND altSku1 IS NULL;

-- Merge BFH-30 (9450026) into BFH30 (9360018)
UPDATE distributor_skus SET cabinetId = 9360018 WHERE cabinetId = 9450026;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360018 WHERE cabinetId = 9450026;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450026;
UPDATE cabinets SET altSku1 = 'BFH-30' WHERE id = 9360018 AND altSku1 IS NULL;

-- Merge BFH-30 (9450026) into VS30FH (9390370)
UPDATE distributor_skus SET cabinetId = 9390370 WHERE cabinetId = 9450026;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390370 WHERE cabinetId = 9450026;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450026;
UPDATE cabinets SET altSku1 = 'BFH-30' WHERE id = 9390370 AND altSku1 IS NULL;

-- Merge BFH-33 (9450027) into BFH33 (9360019)
UPDATE distributor_skus SET cabinetId = 9360019 WHERE cabinetId = 9450027;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360019 WHERE cabinetId = 9450027;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450027;
UPDATE cabinets SET altSku1 = 'BFH-33' WHERE id = 9360019 AND altSku1 IS NULL;

-- Merge BFH-33 (9450027) into VS33FH (9390371)
UPDATE distributor_skus SET cabinetId = 9390371 WHERE cabinetId = 9450027;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390371 WHERE cabinetId = 9450027;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450027;
UPDATE cabinets SET altSku1 = 'BFH-33' WHERE id = 9390371 AND altSku1 IS NULL;

-- Merge BFH-36 (9450028) into BFH36 (9360020)
UPDATE distributor_skus SET cabinetId = 9360020 WHERE cabinetId = 9450028;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360020 WHERE cabinetId = 9450028;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450028;
UPDATE cabinets SET altSku1 = 'BFH-36' WHERE id = 9360020 AND altSku1 IS NULL;

-- Merge BFH-36 (9450028) into VS36FH (9390372)
UPDATE distributor_skus SET cabinetId = 9390372 WHERE cabinetId = 9450028;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390372 WHERE cabinetId = 9450028;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450028;
UPDATE cabinets SET altSku1 = 'BFH-36' WHERE id = 9390372 AND altSku1 IS NULL;

-- Merge BFH-12 (9450030) into 3DB12 (9360024)
UPDATE distributor_skus SET cabinetId = 9360024 WHERE cabinetId = 9450030;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360024 WHERE cabinetId = 9450030;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450030;
UPDATE cabinets SET altSku1 = 'BFH-12' WHERE id = 9360024 AND altSku1 IS NULL;

-- Merge BFH-15 (9450031) into 3DB15 (9360025)
UPDATE distributor_skus SET cabinetId = 9360025 WHERE cabinetId = 9450031;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360025 WHERE cabinetId = 9450031;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450031;
UPDATE cabinets SET altSku1 = 'BFH-15' WHERE id = 9360025 AND altSku1 IS NULL;

-- Merge BFH-15 (9450031) into B15FH (9390194)
UPDATE distributor_skus SET cabinetId = 9390194 WHERE cabinetId = 9450031;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390194 WHERE cabinetId = 9450031;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450031;
UPDATE cabinets SET altSku1 = 'BFH-15' WHERE id = 9390194 AND altSku1 IS NULL;

-- Merge 3DB18 (9360026) into BFH-18 (9450032)
UPDATE distributor_skus SET cabinetId = 9450032 WHERE cabinetId = 9360026;
UPDATE distributor_cabinet_overrides SET cabinetId = 9450032 WHERE cabinetId = 9360026;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360026;
UPDATE cabinets SET altSku1 = '3DB18' WHERE id = 9450032 AND altSku1 IS NULL;

-- Merge BFH-18 (9450032) into B18FH (9390195)
UPDATE distributor_skus SET cabinetId = 9390195 WHERE cabinetId = 9450032;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390195 WHERE cabinetId = 9450032;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450032;
UPDATE cabinets SET altSku1 = 'BFH-18' WHERE id = 9390195 AND altSku1 IS NULL;

-- Merge BFH-24 (9450033) into B24FH (9390197)
UPDATE distributor_skus SET cabinetId = 9390197 WHERE cabinetId = 9450033;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390197 WHERE cabinetId = 9450033;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450033;
UPDATE cabinets SET altSku1 = 'BFH-24' WHERE id = 9390197 AND altSku1 IS NULL;

-- Merge BSDC-6 (9450035) into BSDC6 (9360049)
UPDATE distributor_skus SET cabinetId = 9360049 WHERE cabinetId = 9450035;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360049 WHERE cabinetId = 9450035;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450035;
UPDATE cabinets SET altSku1 = 'BSDC-6' WHERE id = 9360049 AND altSku1 IS NULL;

-- Merge BT-09 (9450037) into BT9 (9390192)
UPDATE distributor_skus SET cabinetId = 9390192 WHERE cabinetId = 9450037;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390192 WHERE cabinetId = 9450037;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450037;
UPDATE cabinets SET altSku1 = 'BT-09' WHERE id = 9390192 AND altSku1 IS NULL;

-- Merge BWB-18 (9450038) into BWB18 (9360052)
UPDATE distributor_skus SET cabinetId = 9360052 WHERE cabinetId = 9450038;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360052 WHERE cabinetId = 9450038;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450038;
UPDATE cabinets SET altSku1 = 'BWB-18' WHERE id = 9360052 AND altSku1 IS NULL;

-- Merge CSB-36 (9450039) into CSB36 (9360038)
UPDATE distributor_skus SET cabinetId = 9360038 WHERE cabinetId = 9450039;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360038 WHERE cabinetId = 9450039;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450039;
UPDATE cabinets SET altSku1 = 'CSB-36' WHERE id = 9360038 AND altSku1 IS NULL;

-- Merge DCSF-42 (9450040) into DCSF42 (9360039)
UPDATE distributor_skus SET cabinetId = 9360039 WHERE cabinetId = 9450040;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360039 WHERE cabinetId = 9450040;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450040;
UPDATE cabinets SET altSku1 = 'DCSF-42' WHERE id = 9360039 AND altSku1 IS NULL;

-- Merge DCW-24-12GD (9450041) into DCW2412GD (9360154)
UPDATE distributor_skus SET cabinetId = 9360154 WHERE cabinetId = 9450041;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360154 WHERE cabinetId = 9450041;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450041;
UPDATE cabinets SET altSku1 = 'DCW-24-12GD' WHERE id = 9360154 AND altSku1 IS NULL;

-- Merge DCW-24-15GD (9450042) into DCW2415GD (9390332)
UPDATE distributor_skus SET cabinetId = 9390332 WHERE cabinetId = 9450042;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390332 WHERE cabinetId = 9450042;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450042;
UPDATE cabinets SET altSku1 = 'DCW-24-15GD' WHERE id = 9390332 AND altSku1 IS NULL;

-- Merge DCW-24-18GD (9450043) into DCW2418GD (9390342)
UPDATE distributor_skus SET cabinetId = 9390342 WHERE cabinetId = 9450043;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390342 WHERE cabinetId = 9450043;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450043;
UPDATE cabinets SET altSku1 = 'DCW-24-18GD' WHERE id = 9390342 AND altSku1 IS NULL;

-- Merge DCW-24-30 (9450044) into DCW2430 (9360149)
UPDATE distributor_skus SET cabinetId = 9360149 WHERE cabinetId = 9450044;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360149 WHERE cabinetId = 9450044;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450044;
UPDATE cabinets SET altSku1 = 'DCW-24-30' WHERE id = 9360149 AND altSku1 IS NULL;

-- Merge DCW-24-30GD (9450045) into DCW2430GD (9360156)
UPDATE distributor_skus SET cabinetId = 9360156 WHERE cabinetId = 9450045;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360156 WHERE cabinetId = 9450045;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450045;
UPDATE cabinets SET altSku1 = 'DCW-24-30GD' WHERE id = 9360156 AND altSku1 IS NULL;

-- Merge DCW-24-36 (9450046) into DCW2436 (9360150)
UPDATE distributor_skus SET cabinetId = 9360150 WHERE cabinetId = 9450046;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360150 WHERE cabinetId = 9450046;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450046;
UPDATE cabinets SET altSku1 = 'DCW-24-36' WHERE id = 9360150 AND altSku1 IS NULL;

-- Merge DCW-24-36GD (9450047) into DCW2436GD (9360157)
UPDATE distributor_skus SET cabinetId = 9360157 WHERE cabinetId = 9450047;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360157 WHERE cabinetId = 9450047;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450047;
UPDATE cabinets SET altSku1 = 'DCW-24-36GD' WHERE id = 9360157 AND altSku1 IS NULL;

-- Merge DCW-24-42 (9450048) into DCW2442 (9360151)
UPDATE distributor_skus SET cabinetId = 9360151 WHERE cabinetId = 9450048;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360151 WHERE cabinetId = 9450048;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450048;
UPDATE cabinets SET altSku1 = 'DCW-24-42' WHERE id = 9360151 AND altSku1 IS NULL;

-- Merge DCW-24-42GD (9450049) into DCW2442GD (9360158)
UPDATE distributor_skus SET cabinetId = 9360158 WHERE cabinetId = 9450049;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360158 WHERE cabinetId = 9450049;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450049;
UPDATE cabinets SET altSku1 = 'DCW-24-42GD' WHERE id = 9360158 AND altSku1 IS NULL;

-- Merge DCW-27-12GD (9450050) into DCW2712GD (9360155)
UPDATE distributor_skus SET cabinetId = 9360155 WHERE cabinetId = 9450050;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360155 WHERE cabinetId = 9450050;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450050;
UPDATE cabinets SET altSku1 = 'DCW-27-12GD' WHERE id = 9360155 AND altSku1 IS NULL;

-- Merge DCW-27-36 (9450051) into DCW2736 (9360152)
UPDATE distributor_skus SET cabinetId = 9360152 WHERE cabinetId = 9450051;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360152 WHERE cabinetId = 9450051;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450051;
UPDATE cabinets SET altSku1 = 'DCW-27-36' WHERE id = 9360152 AND altSku1 IS NULL;

-- Merge DCW-27-42 (9450052) into DCW2742 (9360153)
UPDATE distributor_skus SET cabinetId = 9360153 WHERE cabinetId = 9450052;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360153 WHERE cabinetId = 9450052;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450052;
UPDATE cabinets SET altSku1 = 'DCW-27-42' WHERE id = 9360153 AND altSku1 IS NULL;

-- Merge DFB-18 (9450053) into DFB18 (9360053)
UPDATE distributor_skus SET cabinetId = 9360053 WHERE cabinetId = 9450053;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360053 WHERE cabinetId = 9450053;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450053;
UPDATE cabinets SET altSku1 = 'DFB-18' WHERE id = 9360053 AND altSku1 IS NULL;

-- Merge ERB-33 (9450054) into ERB33 (9360041)
UPDATE distributor_skus SET cabinetId = 9360041 WHERE cabinetId = 9450054;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360041 WHERE cabinetId = 9450054;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450054;
UPDATE cabinets SET altSku1 = 'ERB-33' WHERE id = 9360041 AND altSku1 IS NULL;

-- Merge ERB-36 (9450055) into ERB36 (9360042)
UPDATE distributor_skus SET cabinetId = 9360042 WHERE cabinetId = 9450055;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360042 WHERE cabinetId = 9450055;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450055;
UPDATE cabinets SET altSku1 = 'ERB-36' WHERE id = 9360042 AND altSku1 IS NULL;

-- Merge F-3-42 (9450056) into F342 (9360195)
UPDATE distributor_skus SET cabinetId = 9360195 WHERE cabinetId = 9450056;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360195 WHERE cabinetId = 9450056;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450056;
UPDATE cabinets SET altSku1 = 'F-3-42' WHERE id = 9360195 AND altSku1 IS NULL;

-- Merge F-6-42 (9450057) into F642 (9360197)
UPDATE distributor_skus SET cabinetId = 9360197 WHERE cabinetId = 9450057;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360197 WHERE cabinetId = 9450057;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450057;
UPDATE cabinets SET altSku1 = 'F-6-42' WHERE id = 9360197 AND altSku1 IS NULL;

-- Merge FSB-30 (9450064) into FSB30 (9390224)
UPDATE distributor_skus SET cabinetId = 9390224 WHERE cabinetId = 9450064;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390224 WHERE cabinetId = 9450064;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450064;
UPDATE cabinets SET altSku1 = 'FSB-30' WHERE id = 9390224 AND altSku1 IS NULL;

-- Merge MB-30 (9450065) into MB30 (9360050)
UPDATE distributor_skus SET cabinetId = 9360050 WHERE cabinetId = 9450065;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360050 WHERE cabinetId = 9450065;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450065;
UPDATE cabinets SET altSku1 = 'MB-30' WHERE id = 9360050 AND altSku1 IS NULL;

-- Merge MB-33 (9450066) into MB33 (9360051)
UPDATE distributor_skus SET cabinetId = 9360051 WHERE cabinetId = 9450066;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360051 WHERE cabinetId = 9450066;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450066;
UPDATE cabinets SET altSku1 = 'MB-33' WHERE id = 9360051 AND altSku1 IS NULL;

-- Merge OE-6-30 (9450068) into OE630 (9360162)
UPDATE distributor_skus SET cabinetId = 9360162 WHERE cabinetId = 9450068;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360162 WHERE cabinetId = 9450068;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450068;
UPDATE cabinets SET altSku1 = 'OE-6-30' WHERE id = 9360162 AND altSku1 IS NULL;

-- Merge OE-6-36 (9450069) into OE636 (9360163)
UPDATE distributor_skus SET cabinetId = 9360163 WHERE cabinetId = 9450069;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360163 WHERE cabinetId = 9450069;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450069;
UPDATE cabinets SET altSku1 = 'OE-6-36' WHERE id = 9360163 AND altSku1 IS NULL;

-- Merge OE-6-42 (9450070) into OE642 (9360164)
UPDATE distributor_skus SET cabinetId = 9360164 WHERE cabinetId = 9450070;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360164 WHERE cabinetId = 9450070;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450070;
UPDATE cabinets SET altSku1 = 'OE-6-42' WHERE id = 9360164 AND altSku1 IS NULL;

-- Merge SB-27 (9450074) into SB27 (9360033)
UPDATE distributor_skus SET cabinetId = 9360033 WHERE cabinetId = 9450074;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360033 WHERE cabinetId = 9450074;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450074;
UPDATE cabinets SET altSku1 = 'SB-27' WHERE id = 9360033 AND altSku1 IS NULL;

-- Merge SB-30 (9450075) into SB30 (9360034)
UPDATE distributor_skus SET cabinetId = 9360034 WHERE cabinetId = 9450075;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360034 WHERE cabinetId = 9450075;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450075;
UPDATE cabinets SET altSku1 = 'SB-30' WHERE id = 9360034 AND altSku1 IS NULL;

-- Merge SB-30 (9450075) into SB30S (9390219)
UPDATE distributor_skus SET cabinetId = 9390219 WHERE cabinetId = 9450075;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390219 WHERE cabinetId = 9450075;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450075;
UPDATE cabinets SET altSku1 = 'SB-30' WHERE id = 9390219 AND altSku1 IS NULL;

-- Merge SPB-6 (9450079) into SPB6 (9360047)
UPDATE distributor_skus SET cabinetId = 9360047 WHERE cabinetId = 9450079;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360047 WHERE cabinetId = 9450079;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450079;
UPDATE cabinets SET altSku1 = 'SPB-6' WHERE id = 9360047 AND altSku1 IS NULL;

-- Merge SPB-9 (9450080) into SPB9 (9360048)
UPDATE distributor_skus SET cabinetId = 9360048 WHERE cabinetId = 9450080;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360048 WHERE cabinetId = 9450080;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450080;
UPDATE cabinets SET altSku1 = 'SPB-9' WHERE id = 9360048 AND altSku1 IS NULL;

-- Merge RS-18 (9450083) into RS18 (9360181)
UPDATE distributor_skus SET cabinetId = 9360181 WHERE cabinetId = 9450083;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360181 WHERE cabinetId = 9450083;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450083;
UPDATE cabinets SET altSku1 = 'RS-18' WHERE id = 9360181 AND altSku1 IS NULL;

-- Merge RS-21 (9450084) into RS21 (9360183)
UPDATE distributor_skus SET cabinetId = 9360183 WHERE cabinetId = 9450084;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360183 WHERE cabinetId = 9450084;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450084;
UPDATE cabinets SET altSku1 = 'RS-21' WHERE id = 9360183 AND altSku1 IS NULL;

-- Merge RS-24 (9450085) into RS24 (9360185)
UPDATE distributor_skus SET cabinetId = 9360185 WHERE cabinetId = 9450085;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360185 WHERE cabinetId = 9450085;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450085;
UPDATE cabinets SET altSku1 = 'RS-24' WHERE id = 9360185 AND altSku1 IS NULL;

-- Merge RS-27 (9450086) into RS27 (9360187)
UPDATE distributor_skus SET cabinetId = 9360187 WHERE cabinetId = 9450086;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360187 WHERE cabinetId = 9450086;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450086;
UPDATE cabinets SET altSku1 = 'RS-27' WHERE id = 9360187 AND altSku1 IS NULL;

-- Merge RS-30 (9450087) into RS30 (9360189)
UPDATE distributor_skus SET cabinetId = 9360189 WHERE cabinetId = 9450087;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360189 WHERE cabinetId = 9450087;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450087;
UPDATE cabinets SET altSku1 = 'RS-30' WHERE id = 9360189 AND altSku1 IS NULL;

-- Merge RS-33 (9450088) into RS33 (9360190)
UPDATE distributor_skus SET cabinetId = 9360190 WHERE cabinetId = 9450088;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360190 WHERE cabinetId = 9450088;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450088;
UPDATE cabinets SET altSku1 = 'RS-33' WHERE id = 9360190 AND altSku1 IS NULL;

-- Merge RS-36 (9450089) into RS36 (9360191)
UPDATE distributor_skus SET cabinetId = 9360191 WHERE cabinetId = 9450089;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360191 WHERE cabinetId = 9450089;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450089;
UPDATE cabinets SET altSku1 = 'RS-36' WHERE id = 9360191 AND altSku1 IS NULL;

-- Merge USV-24-96 (9450090) into USV2496 (9360213)
UPDATE distributor_skus SET cabinetId = 9360213 WHERE cabinetId = 9450090;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360213 WHERE cabinetId = 9450090;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450090;
UPDATE cabinets SET altSku1 = 'USV-24-96' WHERE id = 9360213 AND altSku1 IS NULL;

-- Merge V-33-21DL (9450094) into V3321DL (9360259)
UPDATE distributor_skus SET cabinetId = 9360259 WHERE cabinetId = 9450094;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360259 WHERE cabinetId = 9450094;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450094;
UPDATE cabinets SET altSku1 = 'V-33-21DL' WHERE id = 9360259 AND altSku1 IS NULL;

-- Merge V-33-21DR (9450095) into V3321DR (9360260)
UPDATE distributor_skus SET cabinetId = 9360260 WHERE cabinetId = 9450095;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360260 WHERE cabinetId = 9450095;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450095;
UPDATE cabinets SET altSku1 = 'V-33-21DR' WHERE id = 9360260 AND altSku1 IS NULL;

-- Merge VDB-12-3 (9450106) into 3VDB12 (9360263)
UPDATE distributor_skus SET cabinetId = 9360263 WHERE cabinetId = 9450106;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360263 WHERE cabinetId = 9450106;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450106;
UPDATE cabinets SET altSku1 = 'VDB-12-3' WHERE id = 9360263 AND altSku1 IS NULL;

-- Merge VDB-15-3 (9450107) into 3VDB15 (9360264)
UPDATE distributor_skus SET cabinetId = 9360264 WHERE cabinetId = 9450107;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360264 WHERE cabinetId = 9450107;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450107;
UPDATE cabinets SET altSku1 = 'VDB-15-3' WHERE id = 9360264 AND altSku1 IS NULL;

-- Merge VDB-18-3 (9450108) into 3VDB18 (9360265)
UPDATE distributor_skus SET cabinetId = 9360265 WHERE cabinetId = 9450108;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360265 WHERE cabinetId = 9450108;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450108;
UPDATE cabinets SET altSku1 = 'VDB-18-3' WHERE id = 9360265 AND altSku1 IS NULL;

-- Merge VDB-21-3 (9450109) into 3VDB21 (9360266)
UPDATE distributor_skus SET cabinetId = 9360266 WHERE cabinetId = 9450109;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360266 WHERE cabinetId = 9450109;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450109;
UPDATE cabinets SET altSku1 = 'VDB-21-3' WHERE id = 9360266 AND altSku1 IS NULL;

-- Merge VDB-24-3 (9450110) into 3VDB24 (9360267)
UPDATE distributor_skus SET cabinetId = 9360267 WHERE cabinetId = 9450110;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360267 WHERE cabinetId = 9450110;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450110;
UPDATE cabinets SET altSku1 = 'VDB-24-3' WHERE id = 9360267 AND altSku1 IS NULL;

-- Merge VS-24 (9450111) into VS24 (9360249)
UPDATE distributor_skus SET cabinetId = 9360249 WHERE cabinetId = 9450111;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360249 WHERE cabinetId = 9450111;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450111;
UPDATE cabinets SET altSku1 = 'VS-24' WHERE id = 9360249 AND altSku1 IS NULL;

-- Merge VS-27 (9450112) into VS27 (9360250)
UPDATE distributor_skus SET cabinetId = 9360250 WHERE cabinetId = 9450112;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360250 WHERE cabinetId = 9450112;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450112;
UPDATE cabinets SET altSku1 = 'VS-27' WHERE id = 9360250 AND altSku1 IS NULL;

-- Merge VS-30 (9450113) into VS30 (9360251)
UPDATE distributor_skus SET cabinetId = 9360251 WHERE cabinetId = 9450113;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360251 WHERE cabinetId = 9450113;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450113;
UPDATE cabinets SET altSku1 = 'VS-30' WHERE id = 9360251 AND altSku1 IS NULL;

-- Merge VS-30 (9450113) into VS30S (9390375)
UPDATE distributor_skus SET cabinetId = 9390375 WHERE cabinetId = 9450113;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390375 WHERE cabinetId = 9450113;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450113;
UPDATE cabinets SET altSku1 = 'VS-30' WHERE id = 9390375 AND altSku1 IS NULL;

-- Merge VS-33 (9450114) into VS33 (9360252)
UPDATE distributor_skus SET cabinetId = 9360252 WHERE cabinetId = 9450114;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360252 WHERE cabinetId = 9450114;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450114;
UPDATE cabinets SET altSku1 = 'VS-33' WHERE id = 9360252 AND altSku1 IS NULL;

-- Merge VS-36 (9450115) into VS36 (9360253)
UPDATE distributor_skus SET cabinetId = 9360253 WHERE cabinetId = 9450115;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360253 WHERE cabinetId = 9450115;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450115;
UPDATE cabinets SET altSku1 = 'VS-36' WHERE id = 9360253 AND altSku1 IS NULL;

-- Merge VSD-36 (9450116) into VSD36 (9360254)
UPDATE distributor_skus SET cabinetId = 9360254 WHERE cabinetId = 9450116;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360254 WHERE cabinetId = 9450116;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450116;
UPDATE cabinets SET altSku1 = 'VSD-36' WHERE id = 9360254 AND altSku1 IS NULL;

-- Merge VSD-42 (9450117) into VSD42 (9360255)
UPDATE distributor_skus SET cabinetId = 9360255 WHERE cabinetId = 9450117;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360255 WHERE cabinetId = 9450117;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450117;
UPDATE cabinets SET altSku1 = 'VSD-42' WHERE id = 9360255 AND altSku1 IS NULL;

-- Merge VSD-48 (9450118) into VSD48 (9360256)
UPDATE distributor_skus SET cabinetId = 9360256 WHERE cabinetId = 9450118;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360256 WHERE cabinetId = 9450118;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450118;
UPDATE cabinets SET altSku1 = 'VSD-48' WHERE id = 9360256 AND altSku1 IS NULL;

-- Merge W-12-12GD (9450119) into W1212GD (9360111)
UPDATE distributor_skus SET cabinetId = 9360111 WHERE cabinetId = 9450119;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360111 WHERE cabinetId = 9450119;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450119;
UPDATE cabinets SET altSku1 = 'W-12-12GD' WHERE id = 9360111 AND altSku1 IS NULL;

-- Merge W-12-15GD (9450120) into W1215GD (9390323)
UPDATE distributor_skus SET cabinetId = 9390323 WHERE cabinetId = 9450120;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390323 WHERE cabinetId = 9450120;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450120;
UPDATE cabinets SET altSku1 = 'W-12-15GD' WHERE id = 9390323 AND altSku1 IS NULL;

-- Merge W-12-18GD (9450121) into W1218GD (9390333)
UPDATE distributor_skus SET cabinetId = 9390333 WHERE cabinetId = 9450121;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390333 WHERE cabinetId = 9450121;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450121;
UPDATE cabinets SET altSku1 = 'W-12-18GD' WHERE id = 9390333 AND altSku1 IS NULL;

-- Merge W-15-12GD (9450122) into W1512GD (9360112)
UPDATE distributor_skus SET cabinetId = 9360112 WHERE cabinetId = 9450122;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360112 WHERE cabinetId = 9450122;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450122;
UPDATE cabinets SET altSku1 = 'W-15-12GD' WHERE id = 9360112 AND altSku1 IS NULL;

-- Merge W-15-15GD (9450123) into W1515GD (9390324)
UPDATE distributor_skus SET cabinetId = 9390324 WHERE cabinetId = 9450123;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390324 WHERE cabinetId = 9450123;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450123;
UPDATE cabinets SET altSku1 = 'W-15-15GD' WHERE id = 9390324 AND altSku1 IS NULL;

-- Merge W-15-18GD (9450124) into W1518GD (9390334)
UPDATE distributor_skus SET cabinetId = 9390334 WHERE cabinetId = 9450124;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390334 WHERE cabinetId = 9450124;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450124;
UPDATE cabinets SET altSku1 = 'W-15-18GD' WHERE id = 9390334 AND altSku1 IS NULL;

-- Merge W-15-30GD (9450125) into W1530GD (9360098)
UPDATE distributor_skus SET cabinetId = 9360098 WHERE cabinetId = 9450125;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360098 WHERE cabinetId = 9450125;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450125;
UPDATE cabinets SET altSku1 = 'W-15-30GD' WHERE id = 9360098 AND altSku1 IS NULL;

-- Merge W-15-36GD (9450126) into W1536GD (9360100)
UPDATE distributor_skus SET cabinetId = 9360100 WHERE cabinetId = 9450126;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360100 WHERE cabinetId = 9450126;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450126;
UPDATE cabinets SET altSku1 = 'W-15-36GD' WHERE id = 9360100 AND altSku1 IS NULL;

-- Merge W-15-42GD (9450127) into W1542GD (9360103)
UPDATE distributor_skus SET cabinetId = 9360103 WHERE cabinetId = 9450127;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360103 WHERE cabinetId = 9450127;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450127;
UPDATE cabinets SET altSku1 = 'W-15-42GD' WHERE id = 9360103 AND altSku1 IS NULL;

-- Merge W-18-12GD (9450128) into W1812GD (9360113)
UPDATE distributor_skus SET cabinetId = 9360113 WHERE cabinetId = 9450128;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360113 WHERE cabinetId = 9450128;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450128;
UPDATE cabinets SET altSku1 = 'W-18-12GD' WHERE id = 9360113 AND altSku1 IS NULL;

-- Merge W-18-15GD (9450129) into W1815GD (9390325)
UPDATE distributor_skus SET cabinetId = 9390325 WHERE cabinetId = 9450129;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390325 WHERE cabinetId = 9450129;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450129;
UPDATE cabinets SET altSku1 = 'W-18-15GD' WHERE id = 9390325 AND altSku1 IS NULL;

-- Merge W-18-18GD (9450130) into W1818GD (9390335)
UPDATE distributor_skus SET cabinetId = 9390335 WHERE cabinetId = 9450130;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390335 WHERE cabinetId = 9450130;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450130;
UPDATE cabinets SET altSku1 = 'W-18-18GD' WHERE id = 9390335 AND altSku1 IS NULL;

-- Merge W-18-30GD (9450131) into W1830GD (9360099)
UPDATE distributor_skus SET cabinetId = 9360099 WHERE cabinetId = 9450131;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360099 WHERE cabinetId = 9450131;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450131;
UPDATE cabinets SET altSku1 = 'W-18-30GD' WHERE id = 9360099 AND altSku1 IS NULL;

-- Merge W-18-36GD (9450132) into W1836GD (9360101)
UPDATE distributor_skus SET cabinetId = 9360101 WHERE cabinetId = 9450132;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360101 WHERE cabinetId = 9450132;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450132;
UPDATE cabinets SET altSku1 = 'W-18-36GD' WHERE id = 9360101 AND altSku1 IS NULL;

-- Merge W-18-42GD (9450133) into W1842GD (9360104)
UPDATE distributor_skus SET cabinetId = 9360104 WHERE cabinetId = 9450133;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360104 WHERE cabinetId = 9450133;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450133;
UPDATE cabinets SET altSku1 = 'W-18-42GD' WHERE id = 9360104 AND altSku1 IS NULL;

-- Merge W-21-12GD (9450134) into W2112GD (9360114)
UPDATE distributor_skus SET cabinetId = 9360114 WHERE cabinetId = 9450134;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360114 WHERE cabinetId = 9450134;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450134;
UPDATE cabinets SET altSku1 = 'W-21-12GD' WHERE id = 9360114 AND altSku1 IS NULL;

-- Merge W-21-15GD (9450135) into W2115GD (9390326)
UPDATE distributor_skus SET cabinetId = 9390326 WHERE cabinetId = 9450135;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390326 WHERE cabinetId = 9450135;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450135;
UPDATE cabinets SET altSku1 = 'W-21-15GD' WHERE id = 9390326 AND altSku1 IS NULL;

-- Merge W-21-18GD (9450136) into W2118GD (9390336)
UPDATE distributor_skus SET cabinetId = 9390336 WHERE cabinetId = 9450136;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390336 WHERE cabinetId = 9450136;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450136;
UPDATE cabinets SET altSku1 = 'W-21-18GD' WHERE id = 9390336 AND altSku1 IS NULL;

-- Merge W-24-12GD (9450137) into W2412GD (9360115)
UPDATE distributor_skus SET cabinetId = 9360115 WHERE cabinetId = 9450137;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360115 WHERE cabinetId = 9450137;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450137;
UPDATE cabinets SET altSku1 = 'W-24-12GD' WHERE id = 9360115 AND altSku1 IS NULL;

-- Merge W-24-15GD (9450138) into W2415GD (9390327)
UPDATE distributor_skus SET cabinetId = 9390327 WHERE cabinetId = 9450138;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390327 WHERE cabinetId = 9450138;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450138;
UPDATE cabinets SET altSku1 = 'W-24-15GD' WHERE id = 9390327 AND altSku1 IS NULL;

-- Merge W-24-18 (9450139) into W2418 (9360091)
UPDATE distributor_skus SET cabinetId = 9360091 WHERE cabinetId = 9450139;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360091 WHERE cabinetId = 9450139;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450139;
UPDATE cabinets SET altSku1 = 'W-24-18' WHERE id = 9360091 AND altSku1 IS NULL;

-- Merge W-24-18GD (9450140) into W2418GD (9390337)
UPDATE distributor_skus SET cabinetId = 9390337 WHERE cabinetId = 9450140;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390337 WHERE cabinetId = 9450140;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450140;
UPDATE cabinets SET altSku1 = 'W-24-18GD' WHERE id = 9390337 AND altSku1 IS NULL;

-- Merge W-24-30GD (9450141) into W2430GD (9360105)
UPDATE distributor_skus SET cabinetId = 9360105 WHERE cabinetId = 9450141;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360105 WHERE cabinetId = 9450141;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450141;
UPDATE cabinets SET altSku1 = 'W-24-30GD' WHERE id = 9360105 AND altSku1 IS NULL;

-- Merge W-24-36GD (9450142) into W2436GD (9360107)
UPDATE distributor_skus SET cabinetId = 9360107 WHERE cabinetId = 9450142;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360107 WHERE cabinetId = 9450142;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450142;
UPDATE cabinets SET altSku1 = 'W-24-36GD' WHERE id = 9360107 AND altSku1 IS NULL;

-- Merge W-24-42GD (9450143) into W2442GD (9360109)
UPDATE distributor_skus SET cabinetId = 9360109 WHERE cabinetId = 9450143;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360109 WHERE cabinetId = 9450143;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450143;
UPDATE cabinets SET altSku1 = 'W-24-42GD' WHERE id = 9360109 AND altSku1 IS NULL;

-- Merge W-27-12GD (9450144) into W2712GD (9360116)
UPDATE distributor_skus SET cabinetId = 9360116 WHERE cabinetId = 9450144;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360116 WHERE cabinetId = 9450144;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450144;
UPDATE cabinets SET altSku1 = 'W-27-12GD' WHERE id = 9360116 AND altSku1 IS NULL;

-- Merge W-27-15GD (9450145) into W2715GD (9390328)
UPDATE distributor_skus SET cabinetId = 9390328 WHERE cabinetId = 9450145;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390328 WHERE cabinetId = 9450145;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450145;
UPDATE cabinets SET altSku1 = 'W-27-15GD' WHERE id = 9390328 AND altSku1 IS NULL;

-- Merge W-27-18GD (9450146) into W2718GD (9390338)
UPDATE distributor_skus SET cabinetId = 9390338 WHERE cabinetId = 9450146;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390338 WHERE cabinetId = 9450146;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450146;
UPDATE cabinets SET altSku1 = 'W-27-18GD' WHERE id = 9390338 AND altSku1 IS NULL;

-- Merge W-30-12-24 (9450147) into W301224 (9360120)
UPDATE distributor_skus SET cabinetId = 9360120 WHERE cabinetId = 9450147;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360120 WHERE cabinetId = 9450147;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450147;
UPDATE cabinets SET altSku1 = 'W-30-12-24' WHERE id = 9360120 AND altSku1 IS NULL;

-- Merge W-30-12GD (9450148) into W3012GD (9360117)
UPDATE distributor_skus SET cabinetId = 9360117 WHERE cabinetId = 9450148;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360117 WHERE cabinetId = 9450148;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450148;
UPDATE cabinets SET altSku1 = 'W-30-12GD' WHERE id = 9360117 AND altSku1 IS NULL;

-- Merge W-30-15-24 (9450149) into W301524 (9360121)
UPDATE distributor_skus SET cabinetId = 9360121 WHERE cabinetId = 9450149;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360121 WHERE cabinetId = 9450149;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450149;
UPDATE cabinets SET altSku1 = 'W-30-15-24' WHERE id = 9360121 AND altSku1 IS NULL;

-- Merge W-30-18-24 (9450150) into W301824 (9360122)
UPDATE distributor_skus SET cabinetId = 9360122 WHERE cabinetId = 9450150;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360122 WHERE cabinetId = 9450150;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450150;
UPDATE cabinets SET altSku1 = 'W-30-18-24' WHERE id = 9360122 AND altSku1 IS NULL;

-- Merge W-30-18GD (9450151) into W3018GD (9360102)
UPDATE distributor_skus SET cabinetId = 9360102 WHERE cabinetId = 9450151;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360102 WHERE cabinetId = 9450151;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450151;
UPDATE cabinets SET altSku1 = 'W-30-18GD' WHERE id = 9360102 AND altSku1 IS NULL;

-- Merge W-30-24-24 (9450152) into W302424 (9360129)
UPDATE distributor_skus SET cabinetId = 9360129 WHERE cabinetId = 9450152;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360129 WHERE cabinetId = 9450152;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450152;
UPDATE cabinets SET altSku1 = 'W-30-24-24' WHERE id = 9360129 AND altSku1 IS NULL;

-- Merge W-30-30GD (9450153) into W3030GD (9360106)
UPDATE distributor_skus SET cabinetId = 9360106 WHERE cabinetId = 9450153;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360106 WHERE cabinetId = 9450153;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450153;
UPDATE cabinets SET altSku1 = 'W-30-30GD' WHERE id = 9360106 AND altSku1 IS NULL;

-- Merge W-30-36GD (9450154) into W3036GD (9360108)
UPDATE distributor_skus SET cabinetId = 9360108 WHERE cabinetId = 9450154;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360108 WHERE cabinetId = 9450154;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450154;
UPDATE cabinets SET altSku1 = 'W-30-36GD' WHERE id = 9360108 AND altSku1 IS NULL;

-- Merge W-30-42GD (9450155) into W3042GD (9360110)
UPDATE distributor_skus SET cabinetId = 9360110 WHERE cabinetId = 9450155;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360110 WHERE cabinetId = 9450155;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450155;
UPDATE cabinets SET altSku1 = 'W-30-42GD' WHERE id = 9360110 AND altSku1 IS NULL;

-- Merge W-33-12-24 (9450156) into W331224 (9360123)
UPDATE distributor_skus SET cabinetId = 9360123 WHERE cabinetId = 9450156;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360123 WHERE cabinetId = 9450156;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450156;
UPDATE cabinets SET altSku1 = 'W-33-12-24' WHERE id = 9360123 AND altSku1 IS NULL;

-- Merge W-33-12GD (9450157) into W3312GD (9360118)
UPDATE distributor_skus SET cabinetId = 9360118 WHERE cabinetId = 9450157;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360118 WHERE cabinetId = 9450157;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450157;
UPDATE cabinets SET altSku1 = 'W-33-12GD' WHERE id = 9360118 AND altSku1 IS NULL;

-- Merge W-33-15-24 (9450158) into W331524 (9360124)
UPDATE distributor_skus SET cabinetId = 9360124 WHERE cabinetId = 9450158;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360124 WHERE cabinetId = 9450158;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450158;
UPDATE cabinets SET altSku1 = 'W-33-15-24' WHERE id = 9360124 AND altSku1 IS NULL;

-- Merge W-33-15GD (9450159) into W3315GD (9390330)
UPDATE distributor_skus SET cabinetId = 9390330 WHERE cabinetId = 9450159;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390330 WHERE cabinetId = 9450159;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450159;
UPDATE cabinets SET altSku1 = 'W-33-15GD' WHERE id = 9390330 AND altSku1 IS NULL;

-- Merge W-33-18-24 (9450160) into W331824 (9360125)
UPDATE distributor_skus SET cabinetId = 9360125 WHERE cabinetId = 9450160;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360125 WHERE cabinetId = 9450160;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450160;
UPDATE cabinets SET altSku1 = 'W-33-18-24' WHERE id = 9360125 AND altSku1 IS NULL;

-- Merge W-33-18GD (9450161) into W3318GD (9390340)
UPDATE distributor_skus SET cabinetId = 9390340 WHERE cabinetId = 9450161;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390340 WHERE cabinetId = 9450161;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450161;
UPDATE cabinets SET altSku1 = 'W-33-18GD' WHERE id = 9390340 AND altSku1 IS NULL;

-- Merge W-33-24-24 (9450162) into W332424 (9360130)
UPDATE distributor_skus SET cabinetId = 9360130 WHERE cabinetId = 9450162;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360130 WHERE cabinetId = 9450162;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450162;
UPDATE cabinets SET altSku1 = 'W-33-24-24' WHERE id = 9360130 AND altSku1 IS NULL;

-- Merge W-36-12-24 (9450163) into W361224 (9360126)
UPDATE distributor_skus SET cabinetId = 9360126 WHERE cabinetId = 9450163;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360126 WHERE cabinetId = 9450163;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450163;
UPDATE cabinets SET altSku1 = 'W-36-12-24' WHERE id = 9360126 AND altSku1 IS NULL;

-- Merge W-36-12GD (9450164) into W3612GD (9360119)
UPDATE distributor_skus SET cabinetId = 9360119 WHERE cabinetId = 9450164;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360119 WHERE cabinetId = 9450164;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450164;
UPDATE cabinets SET altSku1 = 'W-36-12GD' WHERE id = 9360119 AND altSku1 IS NULL;

-- Merge W-36-15-24 (9450165) into W361524 (9360127)
UPDATE distributor_skus SET cabinetId = 9360127 WHERE cabinetId = 9450165;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360127 WHERE cabinetId = 9450165;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450165;
UPDATE cabinets SET altSku1 = 'W-36-15-24' WHERE id = 9360127 AND altSku1 IS NULL;

-- Merge W-36-15GD (9450166) into W3615GD (9390331)
UPDATE distributor_skus SET cabinetId = 9390331 WHERE cabinetId = 9450166;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390331 WHERE cabinetId = 9450166;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450166;
UPDATE cabinets SET altSku1 = 'W-36-15GD' WHERE id = 9390331 AND altSku1 IS NULL;

-- Merge W-36-18-24 (9450167) into W361824 (9360128)
UPDATE distributor_skus SET cabinetId = 9360128 WHERE cabinetId = 9450167;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360128 WHERE cabinetId = 9450167;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450167;
UPDATE cabinets SET altSku1 = 'W-36-18-24' WHERE id = 9360128 AND altSku1 IS NULL;

-- Merge W-36-18GD (9450168) into W3618GD (9390341)
UPDATE distributor_skus SET cabinetId = 9390341 WHERE cabinetId = 9450168;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390341 WHERE cabinetId = 9450168;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450168;
UPDATE cabinets SET altSku1 = 'W-36-18GD' WHERE id = 9390341 AND altSku1 IS NULL;

-- Merge W-36-24-24 (9450169) into W362424 (9360131)
UPDATE distributor_skus SET cabinetId = 9360131 WHERE cabinetId = 9450169;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360131 WHERE cabinetId = 9450169;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450169;
UPDATE cabinets SET altSku1 = 'W-36-24-24' WHERE id = 9360131 AND altSku1 IS NULL;

-- Merge WBC-24-30 (9450171) into WBC2430 (9360135)
UPDATE distributor_skus SET cabinetId = 9360135 WHERE cabinetId = 9450171;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360135 WHERE cabinetId = 9450171;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450171;
UPDATE cabinets SET altSku1 = 'WBC-24-30' WHERE id = 9360135 AND altSku1 IS NULL;

-- Merge WBC-24-42 (9450172) into WBC2442 (9360140)
UPDATE distributor_skus SET cabinetId = 9360140 WHERE cabinetId = 9450172;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360140 WHERE cabinetId = 9450172;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450172;
UPDATE cabinets SET altSku1 = 'WBC-24-42' WHERE id = 9360140 AND altSku1 IS NULL;

-- Merge WBC-36-30 (9450173) into WBC3630 (9360137)
UPDATE distributor_skus SET cabinetId = 9360137 WHERE cabinetId = 9450173;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360137 WHERE cabinetId = 9450173;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450173;
UPDATE cabinets SET altSku1 = 'WBC-36-30' WHERE id = 9360137 AND altSku1 IS NULL;

-- Merge WBC-36-42 (9450174) into WBC3642 (9360142)
UPDATE distributor_skus SET cabinetId = 9360142 WHERE cabinetId = 9450174;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360142 WHERE cabinetId = 9450174;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450174;
UPDATE cabinets SET altSku1 = 'WBC-36-42' WHERE id = 9360142 AND altSku1 IS NULL;

-- Merge WD-18-48 (9450175) into WD1848 (9360143)
UPDATE distributor_skus SET cabinetId = 9360143 WHERE cabinetId = 9450175;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360143 WHERE cabinetId = 9450175;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450175;
UPDATE cabinets SET altSku1 = 'WD-18-48' WHERE id = 9360143 AND altSku1 IS NULL;

-- Merge WD-18-54 (9450176) into WD1854 (9360144)
UPDATE distributor_skus SET cabinetId = 9360144 WHERE cabinetId = 9450176;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360144 WHERE cabinetId = 9450176;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450176;
UPDATE cabinets SET altSku1 = 'WD-18-54' WHERE id = 9360144 AND altSku1 IS NULL;

-- Merge WD-18-60 (9450177) into WD1860 (9360145)
UPDATE distributor_skus SET cabinetId = 9360145 WHERE cabinetId = 9450177;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360145 WHERE cabinetId = 9450177;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450177;
UPDATE cabinets SET altSku1 = 'WD-18-60' WHERE id = 9360145 AND altSku1 IS NULL;

-- Merge WDEP-30 (9450178) into WDEP30 (9360202)
UPDATE distributor_skus SET cabinetId = 9360202 WHERE cabinetId = 9450178;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360202 WHERE cabinetId = 9450178;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450178;
UPDATE cabinets SET altSku1 = 'WDEP-30' WHERE id = 9360202 AND altSku1 IS NULL;

-- Merge WDEP-36 (9450179) into WDEP36 (9360203)
UPDATE distributor_skus SET cabinetId = 9360203 WHERE cabinetId = 9450179;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360203 WHERE cabinetId = 9450179;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450179;
UPDATE cabinets SET altSku1 = 'WDEP-36' WHERE id = 9360203 AND altSku1 IS NULL;

-- Merge WDEP-42 (9450180) into WDEP42 (9360204)
UPDATE distributor_skus SET cabinetId = 9360204 WHERE cabinetId = 9450180;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360204 WHERE cabinetId = 9450180;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450180;
UPDATE cabinets SET altSku1 = 'WDEP-42' WHERE id = 9360204 AND altSku1 IS NULL;

-- Merge WER-24-30 (9450184) into WER2430 (9360132)
UPDATE distributor_skus SET cabinetId = 9360132 WHERE cabinetId = 9450184;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360132 WHERE cabinetId = 9450184;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450184;
UPDATE cabinets SET altSku1 = 'WER-24-30' WHERE id = 9360132 AND altSku1 IS NULL;

-- Merge WER-24-36 (9450185) into WER2436 (9360133)
UPDATE distributor_skus SET cabinetId = 9360133 WHERE cabinetId = 9450185;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360133 WHERE cabinetId = 9450185;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450185;
UPDATE cabinets SET altSku1 = 'WER-24-36' WHERE id = 9360133 AND altSku1 IS NULL;

-- Merge WER-24-42 (9450186) into WER2442 (9360134)
UPDATE distributor_skus SET cabinetId = 9360134 WHERE cabinetId = 9450186;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360134 WHERE cabinetId = 9450186;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450186;
UPDATE cabinets SET altSku1 = 'WER-24-42' WHERE id = 9360134 AND altSku1 IS NULL;

-- Merge WRC-24-30 (9450187) into WRC2430 (9360168)
UPDATE distributor_skus SET cabinetId = 9360168 WHERE cabinetId = 9450187;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360168 WHERE cabinetId = 9450187;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450187;
UPDATE cabinets SET altSku1 = 'WRC-24-30' WHERE id = 9360168 AND altSku1 IS NULL;

-- Merge WRC-30-15 (9450188) into WRC3015 (9360166)
UPDATE distributor_skus SET cabinetId = 9360166 WHERE cabinetId = 9450188;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360166 WHERE cabinetId = 9450188;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450188;
UPDATE cabinets SET altSku1 = 'WRC-30-15' WHERE id = 9360166 AND altSku1 IS NULL;

-- Merge WRC-30-18 (9450189) into WRC3018 (9360167)
UPDATE distributor_skus SET cabinetId = 9360167 WHERE cabinetId = 9450189;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360167 WHERE cabinetId = 9450189;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450189;
UPDATE cabinets SET altSku1 = 'WRC-30-18' WHERE id = 9360167 AND altSku1 IS NULL;

-- Merge WSD-6-30 (9450191) into WSD630 (9360169)
UPDATE distributor_skus SET cabinetId = 9360169 WHERE cabinetId = 9450191;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360169 WHERE cabinetId = 9450191;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450191;
UPDATE cabinets SET altSku1 = 'WSD-6-30' WHERE id = 9360169 AND altSku1 IS NULL;

-- Merge WSV-30 (9450193) into WSV30 (9360247)
UPDATE distributor_skus SET cabinetId = 9360247 WHERE cabinetId = 9450193;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360247 WHERE cabinetId = 9450193;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450193;
UPDATE cabinets SET altSku1 = 'WSV-30' WHERE id = 9360247 AND altSku1 IS NULL;

-- Merge WSV-36 (9450194) into WSV36 (9360248)
UPDATE distributor_skus SET cabinetId = 9360248 WHERE cabinetId = 9450194;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360248 WHERE cabinetId = 9450194;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450194;
UPDATE cabinets SET altSku1 = 'WSV-36' WHERE id = 9360248 AND altSku1 IS NULL;

-- Merge WSV-42 (9450195) into WSV42 (9360212)
UPDATE distributor_skus SET cabinetId = 9360212 WHERE cabinetId = 9450195;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360212 WHERE cabinetId = 9450195;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450195;
UPDATE cabinets SET altSku1 = 'WSV-42' WHERE id = 9360212 AND altSku1 IS NULL;

-- Merge BMW-30 (9450196) into BMW30 (9390253)
UPDATE distributor_skus SET cabinetId = 9390253 WHERE cabinetId = 9450196;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390253 WHERE cabinetId = 9450196;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450196;
UPDATE cabinets SET altSku1 = 'BMW-30' WHERE id = 9390253 AND altSku1 IS NULL;

-- Merge WMS-30-18 (9450199) into WMS3018 (9390347)
UPDATE distributor_skus SET cabinetId = 9390347 WHERE cabinetId = 9450199;
UPDATE distributor_cabinet_overrides SET cabinetId = 9390347 WHERE cabinetId = 9450199;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450199;
UPDATE cabinets SET altSku1 = 'WMS-30-18' WHERE id = 9390347 AND altSku1 IS NULL;

-- Merge MO-30-30 (9450201) into MO3030 (9360159)
UPDATE distributor_skus SET cabinetId = 9360159 WHERE cabinetId = 9450201;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360159 WHERE cabinetId = 9450201;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450201;
UPDATE cabinets SET altSku1 = 'MO-30-30' WHERE id = 9360159 AND altSku1 IS NULL;

-- Merge MO-30-36 (9450202) into MO3036 (9360160)
UPDATE distributor_skus SET cabinetId = 9360160 WHERE cabinetId = 9450202;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360160 WHERE cabinetId = 9450202;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450202;
UPDATE cabinets SET altSku1 = 'MO-30-36' WHERE id = 9360160 AND altSku1 IS NULL;

-- Merge MO-30-42 (9450203) into MO3042 (9360161)
UPDATE distributor_skus SET cabinetId = 9360161 WHERE cabinetId = 9450203;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360161 WHERE cabinetId = 9450203;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450203;
UPDATE cabinets SET altSku1 = 'MO-30-42' WHERE id = 9360161 AND altSku1 IS NULL;

-- Merge BFH-12 (9450030) into BFH12 (9360012)
UPDATE distributor_skus SET cabinetId = 9360012 WHERE cabinetId = 9450030;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360012 WHERE cabinetId = 9450030;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450030;
UPDATE cabinets SET altSku1 = 'BFH-12' WHERE id = 9360012 AND altSku1 IS NULL;

-- Merge BFH-15 (9450031) into BFH15 (9360013)
UPDATE distributor_skus SET cabinetId = 9360013 WHERE cabinetId = 9450031;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360013 WHERE cabinetId = 9450031;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450031;
UPDATE cabinets SET altSku1 = 'BFH-15' WHERE id = 9360013 AND altSku1 IS NULL;

-- Merge BFH18 (9360014) into BFH-18 (9450032)
UPDATE distributor_skus SET cabinetId = 9450032 WHERE cabinetId = 9360014;
UPDATE distributor_cabinet_overrides SET cabinetId = 9450032 WHERE cabinetId = 9360014;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9360014;
UPDATE cabinets SET altSku1 = 'BFH18' WHERE id = 9450032 AND altSku1 IS NULL;

-- Merge BFH-24 (9450033) into BFH24 (9360016)
UPDATE distributor_skus SET cabinetId = 9360016 WHERE cabinetId = 9450033;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360016 WHERE cabinetId = 9450033;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450033;
UPDATE cabinets SET altSku1 = 'BFH-24' WHERE id = 9360016 AND altSku1 IS NULL;

-- Merge BT-09 (9450037) into BT09 (9360001)
UPDATE distributor_skus SET cabinetId = 9360001 WHERE cabinetId = 9450037;
UPDATE distributor_cabinet_overrides SET cabinetId = 9360001 WHERE cabinetId = 9450037;
UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = 9450037;
UPDATE cabinets SET altSku1 = 'BT-09' WHERE id = 9360001 AND altSku1 IS NULL;
