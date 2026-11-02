# Door finish classification (dry run)

No database writes. Solid paint is an opaque hex of that door's own color. Wood grain keeps the grain and a stain tint. Adjacent doors get a different seeded tone. Gray is not snapped to a brand swatch.

Styles classified: 123. Solid paint: 112. Wood grain / stain: 11.
Stone Gray (360001) is paint, opaque solid #8d8f92. The old nearest brand swatch is #dedac6 and is not used.

| id | style | category | treatment | own hex | brand snap avoided | delta to snap | neighbor door hex |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 330002 | Aura Cream (Ashford) | paint | opaque solid | #eae5d6 | #dedac6 | 3.4 | #eee9dd |
| 330003 | Terra Shaker (Ashford) | paint | opaque solid | #c8a882 | #d7a46c | 5.8 | #caa886 |
| 330004 | Natura Maple (Ashford) | stain | wood grain + stain tint | #d4b896 | #d7a46c | 8.5 | #dabfa5 |
| 330005 | Zenith Sage (Ashford) | paint | opaque solid | #c1d5b4 | #dedac6 | 10.6 | #c7d8ba |
| 330006 | Villa Blanc (Ashford) | paint | opaque solid | #e8e0d0 | #dedac6 | 3.3 | #ede8db |
| 330007 | Silva Shaker (Ashford) | stain | wood grain + stain tint | #8b6914 | #d7a46c | 23.1 | #8c6214 |
| 330008 | Onyx Shadow (Ashford) | paint | opaque solid | #1a1a1a | #244338 | 18.5 | #181818 |
| 330009 | Slate Echo (Ashford) | paint | opaque solid | #8a9ba8 | #dedac6 | 24.0 | #8799a6 |
| 330010 | Sterling Pulse (Ashford) | paint | opaque solid | #c8c8c8 | #dedac6 | 9.6 | #bfbfbf |
| 330011 | Forest Rust (Ashford) | stain | wood grain + stain tint | #73482a | #244338 | 31.6 | #654525 |
| 330012 | Nimbus Grey (Ashford) | paint | opaque solid | #9aa8b0 | #dedac6 | 19.3 | #99a6af |
| 330013 | Nova White (Ashford) | paint | opaque solid | #ffffff | #fffdf9 | 2.1 | #fbfbfb |
| 330014 | Nova Blanc (Madison) | paint | opaque solid | #f5f5f5 | #fffdf9 | 2.6 | #eeeeee |
| 330015 | Aura Blanc (Madison) | paint | opaque solid | #f0ead6 | #dedac6 | 3.8 | #f3f0de |
| 330016 | Slate Core (Madison) | paint | opaque solid | #9e9e9e | #dedac6 | 18.0 | #a4a4a4 |
| 330017 | Nimbus Blanc (Madison) | paint | opaque solid | #d8d0c8 | #dedac6 | 6.5 | #c8c8c8 |
| 330018 | Ivy Core (Madison) | paint | opaque solid | #4f584c | #244338 | 11.5 | #4a4a4a |
| 330019 | Navy Core (Madison) | paint | opaque solid | #1a2f4a | #244338 | 22.2 | #172942 |
| 330020 | Onyx Core (Madison) | paint | opaque solid | #1a1a1a | #244338 | 18.5 | #232323 |
| 330021 | Honey Core (Madison) | paint | opaque solid | #c8a040 | #d7a46c | 9.6 | #cba849 |
| 330022 | Cinder Core (Madison) | paint | opaque solid | #5a5a5a | #244338 | 17.7 | #575757 |
| 330023 | Edge Blanc (Madison) | paint | opaque solid | #fafafa | #fffdf9 | 2.1 | #f2f2f2 |
| 330024 | Oxford Blanc (Madison) | paint | opaque solid | #f0f0f0 | #f6f3ed | 3.1 | #f0f0f0 |
| 330025 | Sage Haven (Madison) | paint | opaque solid | #7a9a7a | #dedac6 | 23.8 | #7b9b7e |
| 330026 | Casselberry Blanc (Madison) | paint | opaque solid | #ede0c8 | #dedac6 | 4.4 | #eee0cc |
| 330027 | Walnut Haven (Madison) | stain | wood grain + stain tint | #8b6040 | #d7a46c | 24.7 | #83553c |
| 330028 | Iroy Dune (Madison) | paint | opaque solid | #d4c4a0 | #dedac6 | 8.1 | #d8cda9 |
| 330029 | Slate Gray (Madison) | paint | opaque solid | #b8c8d0 | #f6f3ed | 14.0 | #bacad1 |
| 330030 | Warm Toffee (Madison) | paint | opaque solid | #a07850 | #d7a46c | 15.3 | #a48252 |
| 330031 | Warm Mocha (Madison) | paint | opaque solid | #c86040 | #d7a46c | 22.3 | #c95c45 |
| 330032 | Rift Oak (Madison) | stain | wood grain + stain tint | #c8a060 | #d7a46c | 4.8 | #c99f62 |
| 360001 | Stone Gray (Preston) | paint | opaque solid | #8d8f92 | #dedac6 | 23.1 | #909090 |
| 390001 | Blanc Core (Preston) | paint | opaque solid | #f7f6f3 | #fffdf9 | 1.6 | #fbfbfb |
| 390002 | Umbra Shaker (Preston) | paint | opaque solid | #75523e | #244338 | 31.5 | #855947 |
| 390003 | Cobalt Abyss (Preston) | paint | opaque solid | #2d333f | #244338 | 18.2 | #3a3a3a |
| 390004 | Virid Echo (Preston) | paint | opaque solid | #4f5549 | #244338 | 11.9 | #4a4a4a |
| 390005 | Obsidian Forge (Preston) | paint | opaque solid | #34363a | #244338 | 15.7 | #383838 |
| 390006 | Vesper Ash (Preston) | paint | opaque solid | #6f6d6a | #244338 | 22.6 | #747474 |
| 390007 | Selene Gray (Preston) | paint | opaque solid | #8d8f92 | #dedac6 | 23.1 | #858585 |
| 390008 | Zephyr Sage (Preston) | paint | opaque solid | #868d7b | #dedac6 | 22.6 | #7d7d7d |
| 390009 | Aurum Vault (Preston) | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #e5e5e5 |
| 390010 | Sylvan Rust (Preston) | paint | opaque solid | #b08968 | #d7a46c | 10.6 | #b68d74 |
| 390011 | Lumina White (Ashford) | paint | opaque solid | #f7f6f3 | #fffdf9 | 1.6 | #eeeeee |
| 390012 | Carbon Frost | paint | opaque solid | #34363a | #244338 | 15.7 | #434343 |
| 390013 | Dual Vesper (Preston) | paint | opaque solid | #8d8f92 | #dedac6 | 23.1 | #949494 |
| 390014 | Dual Blanc (Preston) | paint | opaque solid | #f7f6f3 | #fffdf9 | 1.6 | #f5f5f5 |
| 390016 | Aero Blanc (Preston) | paint | opaque solid | #f7f6f3 | #fffdf9 | 1.6 | #f5f5f5 |
| 390017 | Aero Sage (Preston) | paint | opaque solid | #4f5549 | #244338 | 11.9 | #4b4b4b |
| 390018 | Aero Obsidian (Preston) | paint | opaque solid | #34363a | #244338 | 15.7 | #343434 |
| 390019 | Aero Solstice (Preston) | stain | wood grain + stain tint | #d1ba8f | #d7a46c | 9.3 | #d8c59f |
| 390020 | Air Dawn (Preston) | stain | wood grain + stain tint | #d1ba8f | #d7a46c | 9.3 | #d0b88c |
| 390021 | Glace Blanc (Preston) | paint | opaque solid | #f7f6f3 | #fffdf9 | 1.6 | #f6f6f6 |
| 390022 | Glace Cinder (Preston) | paint | opaque solid | #8d8f92 | #dedac6 | 23.1 | #868686 |
| 390023 | Vellum Noir (Preston) | paint | opaque solid | #34363a | #244338 | 15.7 | #383838 |
| 390024 | Vellum Cream (Preston) | paint | opaque solid | #ded5c1 | #dedac6 | 2.6 | #e3ddca |
| 390025 | Solis Oak (Preston) | stain | wood grain + stain tint | #d1ba8f | #d7a46c | 9.3 | #cbac81 |
| 390026 | Umbra Oak (Preston) | stain | wood grain + stain tint | #d1ba8f | #d7a46c | 9.3 | #d7be9d |
| 390027 | Drism Clear (Preston) | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #ececec |
| 390028 | Nocturne Glass (Preston) | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #ececec |
| 510001 | Natural Maple (Madison) | stain | wood grain + stain tint | #d1ba8f | #d7a46c | 9.3 | #d5bc99 |
| 510002 | Warm Cashmere (Madison) | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #ececec |
| 510003 | Serene Sage (Madison) | paint | opaque solid | #78826b | #244338 | 25.2 | #79826b |
| 510004 | Serene Harbor (Madison) | paint | opaque solid | #435b77 | #244338 | 22.5 | #3c526b |
| 540001 | Torino TWP | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f9f9f9 |
| 540002 | Torino TGW | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f8f8f8 |
| 540003 | Torino TDW | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #ececec |
| 540004 | Palermo PGW | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #fafafa |
| 540005 | Luxe Classic LSA | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #e8e8e8 |
| 540006 | Luxe Classic LSN | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #eaeaea |
| 540007 | Luxe Classic LSC | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #e2e2e2 |
| 540008 | Zenit Classic ZSA | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f4f4f4 |
| 540009 | Zenit Classic ZSU | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #e8e8e8 |
| 540010 | Zenit Classic ZSL | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #ebebeb |
| 540011 | Zenit Classic ZSN | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f0f0f0 |
| 540012 | Zenit Classic ZSI | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f8f8f8 |
| 540013 | Zenit Classic ZSM | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f2f2f2 |
| 540014 | Zenit Classic ZSB | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #e6e6e6 |
| 540015 | Zenit Classic ZSK | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #efefef |
| 540016 | Zenit Classic ZSW | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f7f7f7 |
| 540017 | Zenit Classic ZSC | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f5f5f5 |
| 540018 | Zenit Classic ZSO | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f7f7f7 |
| 540019 | Zenit Classic ZSP | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #efefef |
| 540020 | Zenit Classic ZSV | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f6f6f6 |
| 540021 | Luxe Select LSP | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f4f4f4 |
| 540022 | Luxe Select LSR | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f4f4f4 |
| 540023 | Syncron Select SSH | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #e7e7e7 |
| 540024 | Syncron Select SSJ | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #e2e2e2 |
| 540025 | Syncron Select SSK | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #e6e6e6 |
| 540026 | Syncron Select SSO | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #ededed |
| 540027 | Syncron Select SSM | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #e5e5e5 |
| 540028 | Syncron Select SSN | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f5f5f5 |
| 540029 | Syncron Select SSE | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #ebebeb |
| 540030 | Syncron Select SSP | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #ededed |
| 540031 | Syncron Select SSQ | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f2f2f2 |
| 540032 | Syncron Select SSS | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f0f0f0 |
| 540033 | Syncron Select SSR | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #e2e2e2 |
| 540034 | Syncron Select SSA | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #ececec |
| 540035 | Syncron Select SSL | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #e5e5e5 |
| 540036 | Syncron Select SSD | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #e6e6e6 |
| 540037 | Syncron Select SSV | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f1f1f1 |
| 540038 | Syncron Select SSZ | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f3f3f3 |
| 540039 | Syncron Select SSX | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #e4e4e4 |
| 540040 | Zenit Slim Cava ZCC | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #e8e8e8 |
| 540041 | Zenit Slim Cava ZCN | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f4f4f4 |
| 540042 | Zenit Slim Cava ZCK | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #eeeeee |
| 540043 | Syncron Slim Cava SCM | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #eeeeee |
| 540044 | Syncron Slim Cava SCN | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f2f2f2 |
| 540045 | Syncron Slim Cava SCQ | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f4f4f4 |
| 540046 | Syncron Slim Cava SCR | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f0f0f0 |
| 540047 | Syncron Slim Cava SCA | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #fafafa |
| 540048 | Syncron Slim Cava SCL | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f7f7f7 |
| 540049 | Syncron Slim Cava SCZ | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f4f4f4 |
| 600001 | White Shaker | paint | opaque solid | #f7f6f3 | #fffdf9 | 1.6 | #f4f4f4 |
| 600002 | Slim Shaker Alabaster | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f9f9f9 |
| 600004 | Versa Shaker | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f6f6f6 |
| 600005 | Pearl White | paint | opaque solid | #f7f6f3 | #fffdf9 | 1.6 | #fbfbfb |
| 600006 | Glacier White | paint | opaque solid | #f7f6f3 | #fffdf9 | 1.6 | #f6f6f6 |
| 600007 | European White Oak | stain | wood grain + stain tint | #d1ba8f | #d7a46c | 9.3 | #d4c196 |
| 600008 | Driftwood | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f9f9f9 |
| 600009 | Dove Grey | paint | opaque solid | #8d8f92 | #dedac6 | 23.1 | #969696 |
| 600010 | Dark Caramel | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #f3f3f3 |
| 600011 | Cyber Grey | paint | opaque solid | #8d8f92 | #dedac6 | 23.1 | #878787 |
| 600014 | Slim Shaker Ebony | paint | opaque solid | #f2f0ea | #f6f3ed | 0.8 | #e4e4e4 |
