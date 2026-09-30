## Gesture parity (standard room vs Wall Builder room)
| cabinet | step | standard wallId / offset, x,y rot width | wall-builder wallId / offset, x,y rot width | result |
|---|---|---|---|---|
| W3030 | start | top / 60 | 60,0 r0 w30 | cw_munkhqc4_4 / 60 | 60,0 r0 w30 | match |
| W3030 | drag_toward_anchor | top / 26.25 | 26.25,0 r0 w30 | cw_munkhqc4_4 / 26.25 | 26.25,0 r0 w30 | match |
| W3030 | nudge_right_3in | top / 29.25 | 29.25,0 r0 w30 | cw_munkhqc4_4 / 29.25 | 29.25,0 r0 w30 | match |
| W3030 | drag_past_run_end | top / 114 | 114,0 r0 w30 | cw_munkhqc4_4 / 114 | 114,0 r0 w30 | match |
| W3030 | drag_back_to_60 | top / 60.125 | 60.125,0 r0 w30 | cw_munkhqc4_4 / 60.125 | 60.125,0 r0 w30 | match |
| W3030 | rotate_90 | None / None | 60.125,0 r90 w30 | None / None | 60.125,0 r90 w30 | match |
| W3030 | rotate_180 | None / None | 60.125,0 r180 w30 | None / None | 60.125,0 r180 w30 | match |
| W3030 | depth_move_in_1 | None / None | 60.125,0 r180 w30 | None / None | 60.125,0 r180 w30 | match |
| W3030 | snap_to_wall_button | top / 60.125 | 60.125,0 r180 w30 | cw_munkhqc4_4 / 60.125 | 60.125,0 r180 w30 | match |
| W3030 | width_resize | top / 60.125 | 60.125,0 r180 w27 | cw_munkhqc4_4 / 60.125 | 60.125,0 r180 w27 | match |
| W3030 | catalog_drop | top / 88.5 | 88.5,0 r0 w30 | cw_munkhqc4_4 / 88.5 | 88.5,0 r0 w30 | match |
| B12 | start | top / 60 | 60,0 r0 w12 | cw_munkhqc4_4 / 60 | 60,0 r0 w12 | match |
| B12 | drag_toward_anchor | top / 24 | 24,0 r0 w12 | cw_munkhqc4_4 / 24 | 24,0 r0 w12 | match |
| B12 | nudge_right_3in | top / 27 | 27,0 r0 w12 | cw_munkhqc4_4 / 27 | 27,0 r0 w12 | match |
| B12 | drag_past_run_end | right / 24 | 120,24 r90 w12 | cw_munkhqc4_5 / 24 | 120,24 r90 w12 | match |
| B12 | drag_back_to_60 | top / 84 | 84,0 r0 w12 | cw_munkhqc4_4 / 84 | 84,0 r0 w12 | match |
| B12 | rotate_90 | None / None | 72,0 r90 w12 | None / None | 72,0 r90 w12 | match |
| B12 | rotate_180 | None / None | 72,0 r180 w12 | None / None | 72,0 r180 w12 | match |
| B12 | depth_move_in_1 | None / None | 72,1 r180 w12 | None / None | 72,1 r180 w12 | match |
| B12 | snap_to_wall_button | top / 72 | 72,0 r180 w12 | cw_munkhqc4_4 / 72 | 72,0 r180 w12 | match |
| B12 | width_resize | top / 72 | 72,0 r180 w15 | cw_munkhqc4_4 / 72 | 72,0 r180 w15 | match |
| B12 | catalog_drop | top / 120 | 120,0 r0 w12 | cw_munkhqc4_4 / 120 | 120,0 r0 w12 | match |
| B36 | start | top / 96 | 96,0 r0 w36 | cw_munkhqc4_4 / 96 | 96,0 r0 w36 | match |
| B36 | drag_toward_anchor | top / 24 | 24,0 r0 w36 | cw_munkhqc4_4 / 24 | 24,0 r0 w36 | match |
| B36 | nudge_right_3in | top / 27 | 27,0 r0 w36 | cw_munkhqc4_4 / 27 | 27,0 r0 w36 | match |
| B36 | drag_past_run_end | right / 0 | 120,0 r90 w36 | cw_munkhqc4_5 / 0 | 120,0 r90 w36 | match |
| B36 | drag_back_to_60 | top / 87 | 87,0 r0 w36 | cw_munkhqc4_4 / 87 | 87,0 r0 w36 | match |
| B36 | rotate_90 | None / None | 87,0 r90 w36 | None / None | 87,0 r90 w36 | match |
| B36 | rotate_180 | None / None | 87,0 r180 w36 | None / None | 87,0 r180 w36 | match |
| B36 | depth_move_in_1 | None / None | 87,1 r180 w36 | None / None | 87,1 r180 w36 | match |
| B36 | snap_to_wall_button | top / 87 | 87,0 r180 w36 | cw_munkhqc4_4 / 87 | 87,0 r180 w36 | match |
| B36 | width_resize | top / 87 | 87,0 r180 w33 | cw_munkhqc4_4 / 87 | 87,0 r180 w33 | match |
| B36 | catalog_drop | top / 25.25 | 25.25,0 r0 w36 | cw_munkhqc4_4 / 25.25 | 25.25,0 r0 w36 | match |

MISMATCHES 0

Snap button titles: standard=Snap to back wall drawn=Snap this cabinet to Wall 1

## Legacy (pre-Phase-1, saved without wallId/wallOffset) restore + nudge
| room | cabinet | seeded as | restored wallId / offset | after nudge +1 | matches metadata-carrying room? |
|---|---|---|---|---|---|
| legacy_standard | W3030 | no wallId, no wallOffset, x=60,y=0 | top / 60 | top / 61 | yes |
| legacy_standard | B12 | no wallId, no wallOffset, x=60,y=0 | top / 60 | top / 61 | yes |
| legacy_standard | B36 | no wallId, no wallOffset, x=96,y=0 | top / 96 | top / 97 | yes |
| legacy_drawn | W3030 | no wallId, no wallOffset, x=60,y=0 | cw_munkhqc4_4 / 60 | cw_munkhqc4_4 / 61 | yes |
| legacy_drawn | B12 | no wallId, no wallOffset, x=60,y=0 | cw_munkhqc4_4 / 60 | cw_munkhqc4_4 / 61 | yes |
| legacy_drawn | B36 | no wallId, no wallOffset, x=96,y=0 | cw_munkhqc4_4 / 96 | cw_munkhqc4_4 / 97 | yes |

LEGACY_MISMATCHES 0
exit 0
