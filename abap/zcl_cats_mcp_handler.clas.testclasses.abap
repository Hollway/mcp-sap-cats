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
    METHODS insert_tables_rows_match FOR TESTING.
    METHODS insert_tables_idempotency FOR TESTING.
    METHODS change_tables_rows_match FOR TESTING.
    METHODS longtext_round_trip FOR TESTING.
    METHODS longtext_itf_formats FOR TESTING.
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

  METHOD insert_tables_rows_match.
    DATA(ls_tables) = cut->build_insert_tables(
      iv_pernr   = c_no_pernr
      it_records = VALUE #( ( workdate = c_no_date hours = 1 longtext = `первый` ext = VALUE #( prjct = 'P1' ) )
                            ( workdate = c_no_date hours = 2 ext = VALUE #( prjct = 'P2' ) )
                            ( workdate = c_no_date hours = 3 longtext = |а{ cl_abap_char_utilities=>newline }б| ext = VALUE #( prjct = 'P3' ) ) ) ).

    cl_abap_unit_assert=>assert_equals( act = lines( ls_tables-catsrecords ) exp = 3 ).
    cl_abap_unit_assert=>assert_equals( act = ls_tables-catsrecords[ 1 ]-longtext exp = abap_true ).
    cl_abap_unit_assert=>assert_equals( act = ls_tables-catsrecords[ 2 ]-longtext exp = abap_false ).
    cl_abap_unit_assert=>assert_equals( act = ls_tables-catsrecords[ 3 ]-employeenumber exp = c_no_pernr ).
    cl_abap_unit_assert=>assert_initial( ls_tables-catsrecords[ 1 ]-extdocumentno ).

    cl_abap_unit_assert=>assert_equals( act = lines( ls_tables-extensionin ) exp = 3 ).
    cl_abap_unit_assert=>assert_equals(
      act = ls_tables-extensionin[ 2 ]
      exp = VALUE bapicats7( structure  = 'BAPI_TE_CATSDB'
                             valuepart1 = cut->to_bapi_te_catsdb( iv_row = 2 is_ext = VALUE #( prjct = 'P2' ) ) ) ).
    cl_abap_unit_assert=>assert_equals(
      act = ls_tables-extensionin[ 3 ]-valuepart1
      exp = cut->to_bapi_te_catsdb( iv_row = 3 is_ext = VALUE #( prjct = 'P3' ) ) ).

    cl_abap_unit_assert=>assert_equals(
      act = VALUE int4_table( FOR ls_line IN ls_tables-longtext ( ls_line-row ) )
      exp = VALUE int4_table( ( 1 ) ( 3 ) ( 3 ) ) ).
  ENDMETHOD.

  METHOD insert_tables_idempotency.
    DATA(ls_tables) = cut->build_insert_tables( iv_pernr           = c_no_pernr
                                                it_records         = VALUE #( ( workdate = c_no_date hours = 1 ) )
                                                iv_idempotency_key = 'KEY12345' ).

    cl_abap_unit_assert=>assert_equals( act = ls_tables-catsrecords[ 1 ]-extsystem exp = 'MCP' ).
    cl_abap_unit_assert=>assert_equals( act = ls_tables-catsrecords[ 1 ]-extapplication exp = 'CATS' ).
    cl_abap_unit_assert=>assert_equals( act = ls_tables-catsrecords[ 1 ]-extdocumentno exp = 'KEY12345' ).
  ENDMETHOD.

  METHOD change_tables_rows_match.
    DATA(ls_tables) = cut->build_change_tables(
      iv_pernr   = c_no_pernr
      it_records = VALUE #( ( counter = '000000000001' workdate = c_no_date hours = 1 )
                            ( counter = '000000000002' workdate = c_no_date hours = 2 longtext = `текст` ) ) ).

    cl_abap_unit_assert=>assert_equals( act = lines( ls_tables-catsrecords ) exp = 2 ).
    cl_abap_unit_assert=>assert_equals( act = ls_tables-catsrecords[ 2 ]-counter exp = '000000000002' ).
    cl_abap_unit_assert=>assert_equals( act = ls_tables-catsrecords[ 2 ]-longtext exp = abap_true ).
    cl_abap_unit_assert=>assert_equals(
      act = ls_tables-extensionin[ 1 ]-valuepart1
      exp = cut->to_bapi_te_catsdb( iv_row = 1 is_ext = VALUE #( ) ) ).
    cl_abap_unit_assert=>assert_equals( act = lines( ls_tables-longtext ) exp = 1 ).
    cl_abap_unit_assert=>assert_equals( act = ls_tables-longtext[ 1 ]-row exp = 2 ).
  ENDMETHOD.

  METHOD longtext_round_trip.
    DATA(lv_text) = |первый абзац{ cl_abap_char_utilities=>newline }{ repeat( val = `б` occ = 200 ) }{ cl_abap_char_utilities=>newline }третий|.

    cl_abap_unit_assert=>assert_equals(
      act = cut->longtext_to_string( cut->split_longtext( iv_row = 1 iv_text = lv_text ) )
      exp = lv_text ).
  ENDMETHOD.

  METHOD longtext_itf_formats.
    DATA(lv_text) = cut->longtext_to_string( VALUE #( ( format_col = '/:' text_line = 'INCLUDE X' )
                                                      ( format_col = '*'  text_line = 'один' )
                                                      ( format_col = ' '  text_line = 'два' )
                                                      ( format_col = '='  text_line = 'три' )
                                                      ( format_col = '/'  text_line = 'четыре' ) ) ).

    cl_abap_unit_assert=>assert_equals( act = lv_text
                                        exp = |один дватри{ cl_abap_char_utilities=>newline }четыре| ).
  ENDMETHOD.

ENDCLASS.
