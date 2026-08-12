# Navigation Verification Notes

The general `/catalog` page now shows the hero and “Shop by Door Style” tiles without the former unscoped “Browse by Cabinet Type” section. The representative affiliate `/store/reaves-way-cabinet-shop` remains family-first and shows the family picker rather than a general category grid.

Direct manual tests of `/family/shaker-white` and `/family/hickory` returned “Door Style Not Found,” indicating those were guessed style-code URLs rather than confirmed database style codes. The next verification step is to identify the actual database style codes for White Shaker and Hickory, then test those family routes and confirm their contextual category tabs.
