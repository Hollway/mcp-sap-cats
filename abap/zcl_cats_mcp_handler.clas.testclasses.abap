CLASS ltc_handler DEFINITION DEFERRED.
CLASS zcl_cats_mcp_handler DEFINITION LOCAL FRIENDS ltc_handler.

CLASS ltc_handler DEFINITION FINAL
  FOR TESTING
  RISK LEVEL HARMLESS
  DURATION SHORT.

  PRIVATE SECTION.
    CONSTANTS:
      c_no_pernr TYPE catsdb-pernr    VALUE '99999999',
      c_no_date  TYPE catsdb-workdate VALUE '99991230'.

    DATA cut TYPE REF TO zcl_cats_mcp_handler.

    METHODS setup.
    METHODS map_receiver_order FOR TESTING.
    METHODS map_receiver_cost_center FOR TESTING.
    METHODS map_receiver_empty FOR TESTING.
    METHODS time_from_hhmm FOR TESTING.
    METHODS split_longtext_empty FOR TESTING.
    METHODS split_longtext_paragraphs FOR TESTING.
    METHODS split_longtext_long_line FOR TESTING.
    METHODS to_messages_keeps_row FOR TESTING.
    METHODS has_errors FOR TESTING.
    METHODS daily_limit_within_norm FOR TESTING.
    METHODS daily_limit_exceeded FOR TESTING.
    METHODS daily_limit_sums_same_day FOR TESTING.
ENDCLASS.

CLASS ltc_handler IMPLEMENTATION.

  METHOD setup.
    cut = NEW #( ).
  ENDMETHOD.

  METHOD map_receiver_order.
    DATA(ls_bapicats1) = VALUE bapicats1( ).
    cut->map_receiver( EXPORTING is_receiver  = VALUE #( order = 'ORDER1' cost_center = 'CC1' )
                       CHANGING  cs_bapicats1 = ls_bapicats1 ).

    cl_abap_unit_assert=>assert_equals( act = ls_bapicats1-rec_order exp = 'ORDER1' ).
    cl_abap_unit_assert=>assert_initial( ls_bapicats1-rec_cctr ).
  ENDMETHOD.

  METHOD map_receiver_cost_center.
    DATA(ls_bapicats1) = VALUE bapicats1( ).
    cut->map_receiver( EXPORTING is_receiver  = VALUE #( cost_center = 'CC1' co_area = 'CA01' )
                       CHANGING  cs_bapicats1 = ls_bapicats1 ).

    cl_abap_unit_assert=>assert_equals( act = ls_bapicats1-rec_cctr exp = 'CC1' ).
    cl_abap_unit_assert=>assert_equals( act = ls_bapicats1-co_area exp = 'CA01' ).
  ENDMETHOD.

  METHOD map_receiver_empty.
    DATA(ls_bapicats1) = VALUE bapicats1( ).
    cut->map_receiver( EXPORTING is_receiver  = VALUE #( )
                       CHANGING  cs_bapicats1 = ls_bapicats1 ).

    cl_abap_unit_assert=>assert_initial( ls_bapicats1 ).
  ENDMETHOD.

  METHOD time_from_hhmm.
    cl_abap_unit_assert=>assert_equals( act = cut->time_from_hhmm( `09:30` ) exp = '093000' ).
    cl_abap_unit_assert=>assert_initial( cut->time_from_hhmm( `` ) ).
    cl_abap_unit_assert=>assert_initial( cut->time_from_hhmm( `9:30` ) ).
  ENDMETHOD.

  METHOD split_longtext_empty.
    cl_abap_unit_assert=>assert_initial( cut->split_longtext( iv_row = 1 iv_text = `` ) ).
  ENDMETHOD.

  METHOD split_longtext_paragraphs.
    DATA(lt_lines) = cut->split_longtext(
      iv_row  = 2
      iv_text = |первый{ cl_abap_char_utilities=>cr_lf }второй| ).

    cl_abap_unit_assert=>assert_equals( act = lines( lt_lines ) exp = 2 ).
    cl_abap_unit_assert=>assert_equals( act = lt_lines[ 1 ] exp = VALUE bapicats8( row = 2 format_col = '*' text_line = 'первый' ) ).
    cl_abap_unit_assert=>assert_equals( act = lt_lines[ 2 ] exp = VALUE bapicats8( row = 2 format_col = '*' text_line = 'второй' ) ).
  ENDMETHOD.

  METHOD split_longtext_long_line.
    DATA(lv_text)  = repeat( val = `a` occ = 200 ).
    DATA(lt_lines) = cut->split_longtext( iv_row = 1 iv_text = lv_text ).

    cl_abap_unit_assert=>assert_equals( act = lines( lt_lines ) exp = 2 ).
    cl_abap_unit_assert=>assert_equals( act = lt_lines[ 1 ]-format_col exp = '*' ).
    cl_abap_unit_assert=>assert_equals( act = strlen( lt_lines[ 1 ]-text_line ) exp = 132 ).
    cl_abap_unit_assert=>assert_equals( act = lt_lines[ 2 ]-format_col exp = '=' ).
    cl_abap_unit_assert=>assert_equals( act = strlen( lt_lines[ 2 ]-text_line ) exp = 68 ).
  ENDMETHOD.

  METHOD to_messages_keeps_row.
    DATA(lt_messages) = cut->to_messages( VALUE #( ( type = 'E' id = 'LR' number = '002' message = 'Блокировка' row = 3 ) ) ).

    cl_abap_unit_assert=>assert_equals(
      act = lt_messages
      exp = VALUE zcl_cats_mcp_handler=>tt_message( ( type = 'E' id = 'LR' number = '002' text = `Блокировка` row = 3 ) ) ).
  ENDMETHOD.

  METHOD has_errors.
    cl_abap_unit_assert=>assert_false( cut->has_errors( VALUE #( ( type = 'W' ) ( type = 'S' ) ) ) ).
    cl_abap_unit_assert=>assert_true( cut->has_errors( VALUE #( ( type = 'S' ) ( type = 'E' ) ) ) ).
    cl_abap_unit_assert=>assert_true( cut->has_errors( VALUE #( ( type = 'A' ) ) ) ).
  ENDMETHOD.

  METHOD daily_limit_within_norm.
    DATA(lt_return) = cut->check_daily_limit( iv_pernr      = c_no_pernr
                                              it_records    = VALUE #( ( workdate = c_no_date hours = 8 ) )
                                              iv_norm_hours = 8 ).

    cl_abap_unit_assert=>assert_initial( lt_return ).
  ENDMETHOD.

  METHOD daily_limit_exceeded.
    DATA(lt_return) = cut->check_daily_limit( iv_pernr      = c_no_pernr
                                              it_records    = VALUE #( ( workdate = c_no_date hours = 9 ) )
                                              iv_norm_hours = 8 ).

    cl_abap_unit_assert=>assert_equals( act = lines( lt_return ) exp = 1 ).
    cl_abap_unit_assert=>assert_equals( act = lt_return[ 1 ]-type exp = 'E' ).
    cl_abap_unit_assert=>assert_equals( act = lt_return[ 1 ]-number exp = '002' ).
  ENDMETHOD.

  METHOD daily_limit_sums_same_day.
    DATA(lt_return) = cut->check_daily_limit( iv_pernr      = c_no_pernr
                                              it_records    = VALUE #( ( workdate = c_no_date hours = 5 )
                                                                       ( workdate = c_no_date hours = 4 )
                                                                       ( workdate = c_no_date - 1 hours = 8 ) )
                                              iv_norm_hours = 8 ).

    cl_abap_unit_assert=>assert_equals( act = lines( lt_return ) exp = 1 ).
  ENDMETHOD.

ENDCLASS.
