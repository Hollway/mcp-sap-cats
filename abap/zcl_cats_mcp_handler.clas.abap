CLASS zcl_cats_mcp_handler DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_http_extension.

  PRIVATE SECTION.
    TYPES:
      BEGIN OF ts_cats_row,
        counter   TYPE catsdb-counter,
        workdate  TYPE catsdb-workdate,
        pernr     TYPE catsdb-pernr,
        rec_cctr  TYPE catsdb-rkostl,
        rec_order TYPE catsdb-raufnr,
        acttype   TYPE catsdb-lstar,
        wagetype  TYPE catsdb-lgart,
        unit      TYPE catsdb-meinh,
        hours     TYPE catsdb-catshours,
        status    TYPE catsdb-status,
        rqsnb     TYPE catsdb-zzrqsnb,
        prjct     TYPE catsdb-zzprjct,
        descr     TYPE catsdb-zzdescr,
        orgunit   TYPE catsdb-zzorgunit,
        longtext  TYPE catsdb-longtext,
      END OF ts_cats_row,
      tt_cats_row TYPE STANDARD TABLE OF ts_cats_row WITH EMPTY KEY,

      BEGIN OF ts_message,
        type   TYPE bapiret2-type,
        id     TYPE bapiret2-id,
        number TYPE bapiret2-number,
        text   TYPE string,
        row    TYPE bapiret2-row,
      END OF ts_message,
      tt_message TYPE STANDARD TABLE OF ts_message WITH EMPTY KEY,

      BEGIN OF ts_read_request,
        pernr     TYPE catsdb-pernr,
        date_from TYPE catsdb-workdate,
        date_to   TYPE catsdb-workdate,
        status    TYPE STANDARD TABLE OF catsdb-status WITH EMPTY KEY,
      END OF ts_read_request,

      BEGIN OF ts_read_response,
        rows        TYPE tt_cats_row,
        total_hours TYPE catsdb-catshours,
        messages    TYPE tt_message,
      END OF ts_read_response,

      tt_bapicats1 TYPE STANDARD TABLE OF bapicats1 WITH EMPTY KEY,
      tt_bapicats2 TYPE STANDARD TABLE OF bapicats2 WITH EMPTY KEY,
      tt_bapicats3 TYPE STANDARD TABLE OF bapicats3 WITH EMPTY KEY,
      tt_bapicats4 TYPE STANDARD TABLE OF bapicats4 WITH EMPTY KEY,
      tt_bapicats7 TYPE STANDARD TABLE OF bapicats7 WITH EMPTY KEY,
      tt_bapicats8 TYPE STANDARD TABLE OF bapicats8 WITH EMPTY KEY,
      tt_bapiret2  TYPE STANDARD TABLE OF bapiret2  WITH EMPTY KEY,
      tt_counter   TYPE STANDARD TABLE OF catsdb-counter WITH EMPTY KEY,

      BEGIN OF ts_receiver,
        order          TYPE bapicats1-rec_order,
        cost_center    TYPE bapicats1-rec_cctr,
        co_area        TYPE bapicats1-co_area,
        wbs            TYPE bapicats1-wbs_element,
        network        TYPE bapicats1-network,
        activity       TYPE bapicats1-activity,
        sub_activity   TYPE bapicats1-sub_activity,
        sales_order    TYPE bapicats1-recsaleord,
        purchase_order TYPE bapicats1-po_number,
        item           TYPE string,
      END OF ts_receiver,

      BEGIN OF ts_ext,
        rqsnb   TYPE catsdb-zzrqsnb,
        prjct   TYPE catsdb-zzprjct,
        descr   TYPE catsdb-zzdescr,
        orgunit TYPE catsdb-zzorgunit,
      END OF ts_ext,

      BEGIN OF ts_record_in,
        workdate        TYPE catsdb-workdate,
        hours           TYPE catsdb-catshours,
        receiver        TYPE ts_receiver,
        unit            TYPE catsdb-meinh,
        wagetype        TYPE catsdb-lgart,
        acttype         TYPE catsdb-lstar,
        send_cctr       TYPE bapicats1-send_cctr,
        shorttext       TYPE bapicats1-shorttext,
        start_time      TYPE string,
        end_time        TYPE string,
        attendance_type TYPE bapicats1-abs_att_type,
        longtext        TYPE string,
        ext             TYPE ts_ext,
      END OF ts_record_in,
      tt_record_in TYPE STANDARD TABLE OF ts_record_in WITH EMPTY KEY,

      BEGIN OF ts_validate_request,
        pernr      TYPE catsdb-pernr,
        profile    TYPE bapicats6-profile,
        records    TYPE tt_record_in,
        norm_hours TYPE catsdb-catshours,
      END OF ts_validate_request,

      BEGIN OF ts_validate_response,
        messages TYPE tt_message,
      END OF ts_validate_response,

      BEGIN OF ts_insert_request,
        pernr           TYPE catsdb-pernr,
        profile         TYPE bapicats6-profile,
        records         TYPE tt_record_in,
        idempotency_key TYPE catsdb-extdocumentno,
        release         TYPE abap_bool,
        norm_hours      TYPE catsdb-catshours,
      END OF ts_insert_request,

      BEGIN OF ts_created_row,
        row      TYPE i,
        counter  TYPE catsdb-counter,
        workdate TYPE catsdb-workdate,
        hours    TYPE catsdb-catshours,
      END OF ts_created_row,
      tt_created_row TYPE STANDARD TABLE OF ts_created_row WITH EMPTY KEY,

      BEGIN OF ts_insert_response,
        created   TYPE tt_created_row,
        committed TYPE abap_bool,
        messages  TYPE tt_message,
      END OF ts_insert_response.

    TYPES:
      BEGIN OF ts_change_record_in,
        counter         TYPE catsdb-counter,
        workdate        TYPE catsdb-workdate,
        hours           TYPE catsdb-catshours,
        receiver        TYPE ts_receiver,
        unit            TYPE catsdb-meinh,
        wagetype        TYPE catsdb-lgart,
        acttype         TYPE catsdb-lstar,
        send_cctr       TYPE bapicats1-send_cctr,
        shorttext       TYPE bapicats1-shorttext,
        start_time      TYPE string,
        end_time        TYPE string,
        attendance_type TYPE bapicats1-abs_att_type,
        longtext        TYPE string,
        ext             TYPE ts_ext,
      END OF ts_change_record_in,
      tt_change_record_in TYPE STANDARD TABLE OF ts_change_record_in WITH EMPTY KEY,

      BEGIN OF ts_change_request,
        pernr      TYPE catsdb-pernr,
        profile    TYPE bapicats6-profile,
        records    TYPE tt_change_record_in,
        test       TYPE abap_bool,
        norm_hours TYPE catsdb-catshours,
      END OF ts_change_request,

      BEGIN OF ts_changed_row,
        row      TYPE i,
        counter  TYPE catsdb-counter,
        workdate TYPE catsdb-workdate,
        status   TYPE bapicats2-status,
      END OF ts_changed_row,
      tt_changed_row TYPE STANDARD TABLE OF ts_changed_row WITH EMPTY KEY,

      BEGIN OF ts_change_response,
        changed   TYPE tt_changed_row,
        committed TYPE abap_bool,
        messages  TYPE tt_message,
      END OF ts_change_response,

      BEGIN OF ts_delete_request,
        counters TYPE STANDARD TABLE OF catsdb-counter WITH EMPTY KEY,
        test     TYPE abap_bool,
      END OF ts_delete_request,

      BEGIN OF ts_deleted_row,
        row     TYPE i,
        counter TYPE catsdb-counter,
      END OF ts_deleted_row,
      tt_deleted_row TYPE STANDARD TABLE OF ts_deleted_row WITH EMPTY KEY,

      BEGIN OF ts_delete_response,
        deleted   TYPE tt_deleted_row,
        committed TYPE abap_bool,
        messages  TYPE tt_message,
      END OF ts_delete_response,

      BEGIN OF ts_release_request,
        pernr     TYPE catsdb-pernr,
        counters  TYPE STANDARD TABLE OF catsdb-counter WITH EMPTY KEY,
        date_from TYPE catsdb-workdate,
        date_to   TYPE catsdb-workdate,
      END OF ts_release_request,

      BEGIN OF ts_released_row,
        row      TYPE i,
        counter  TYPE catsdb-counter,
        workdate TYPE catsdb-workdate,
        status   TYPE bapicats2-status,
      END OF ts_released_row,
      tt_released_row TYPE STANDARD TABLE OF ts_released_row WITH EMPTY KEY,

      BEGIN OF ts_release_response,
        released  TYPE tt_released_row,
        committed TYPE abap_bool,
        messages  TYPE tt_message,
      END OF ts_release_response,

      BEGIN OF ts_catsdb_full,
        counter    TYPE catsdb-counter,
        workdate   TYPE catsdb-workdate,
        pernr      TYPE catsdb-pernr,
        hours      TYPE catsdb-catshours,
        unit       TYPE catsdb-meinh,
        wagetype   TYPE catsdb-lgart,
        acttype    TYPE catsdb-lstar,
        send_cctr  TYPE catsdb-skostl,
        rec_cctr   TYPE catsdb-rkostl,
        co_area    TYPE catsdb-kokrs,
        rec_order  TYPE catsdb-raufnr,
        sales_ord  TYPE catsdb-rkdauf,
        sales_item TYPE catsdb-rkdpos,
        po_number  TYPE catsdb-sebeln,
        po_item    TYPE catsdb-sebelp,
        shorttext  TYPE catsdb-ltxa1,
        att_type   TYPE catsdb-awart,
        start_time TYPE catsdb-beguz,
        end_time   TYPE catsdb-enduz,
        rqsnb      TYPE catsdb-zzrqsnb,
        prjct      TYPE catsdb-zzprjct,
        descr      TYPE catsdb-zzdescr,
        orgunit    TYPE catsdb-zzorgunit,
      END OF ts_catsdb_full,
      tt_catsdb_full TYPE STANDARD TABLE OF ts_catsdb_full WITH EMPTY KEY,
      tt_counter_range TYPE RANGE OF catsdb-counter,
      tt_status_range TYPE RANGE OF catsdb-status.

    TYPES:
      BEGIN OF ts_capacity_request,
        pernr      TYPE catsdb-pernr,
        date_from  TYPE catsdb-workdate,
        date_to    TYPE catsdb-workdate,
        norm_hours TYPE catsdb-catshours,
      END OF ts_capacity_request,

      BEGIN OF ts_booked_day,
        workdate TYPE catsdb-workdate,
        hours    TYPE catsdb-catshours,
      END OF ts_booked_day,
      tt_booked_day TYPE STANDARD TABLE OF ts_booked_day WITH EMPTY KEY,

      BEGIN OF ts_capacity_day,
        date       TYPE catsdb-workdate,
        is_workday TYPE abap_bool,
        booked     TYPE catsdb-catshours,
        free       TYPE catsdb-catshours,
      END OF ts_capacity_day,
      tt_capacity_day TYPE STANDARD TABLE OF ts_capacity_day WITH EMPTY KEY,

      BEGIN OF ts_capacity_response,
        days       TYPE tt_capacity_day,
        norm_hours TYPE catsdb-catshours,
        calendar   TYPE scal-fcalid,
        total_free TYPE catsdb-catshours,
      END OF ts_capacity_response,

      tt_workdate_range TYPE RANGE OF catsdb-workdate,

      BEGIN OF ts_hours_row,
        counter  TYPE catsdb-counter,
        workdate TYPE catsdb-workdate,
        hours    TYPE catsdb-catshours,
      END OF ts_hours_row,
      tt_hours_row TYPE STANDARD TABLE OF ts_hours_row WITH EMPTY KEY.

    TYPES:
      BEGIN OF ts_whoami_response,
        user     TYPE sy-uname,
        pernr    TYPE catsdb-pernr,
        name     TYPE pa0001-ename,
        orgeh    TYPE pa0001-orgeh,
        orgunit  TYPE t527x-orgtx,
        messages TYPE tt_message,
      END OF ts_whoami_response,

      BEGIN OF ts_projects_request,
        search TYPE string,
        prjct  TYPE zbtprjct-prjct,
      END OF ts_projects_request,

      BEGIN OF ts_project,
        prjct TYPE zbtprjct-prjct,
        text  TYPE zbtprjctt-prjct_t,
      END OF ts_project,
      tt_project TYPE STANDARD TABLE OF ts_project WITH EMPTY KEY,

      BEGIN OF ts_request_row,
        rqsnb     TYPE zbtproject-rqsnb,
        text      TYPE zbtreqspt-rqsnm,
        date_from TYPE zbtproject-fcbdt,
        date_to   TYPE zbtproject-fcedt,
        rejected  TYPE zbtproject-is_rejected,
      END OF ts_request_row,
      tt_request_row TYPE STANDARD TABLE OF ts_request_row WITH EMPTY KEY,

      BEGIN OF ts_projects_response,
        projects TYPE tt_project,
        requests TYPE tt_request_row,
        messages TYPE tt_message,
      END OF ts_projects_response.

    CONSTANTS:
      c_extsystem      TYPE catsdb-extsystem      VALUE 'MCP',
      c_extapplication TYPE catsdb-extapplication VALUE 'CATS',
      c_calendar       TYPE scal-fcalid           VALUE 'BY',
      c_status_cancelled TYPE catsdb-status       VALUE '60'.

    METHODS route_read
      IMPORTING server TYPE REF TO if_http_server.

    METHODS route_validate
      IMPORTING server TYPE REF TO if_http_server.

    METHODS route_insert
      IMPORTING server TYPE REF TO if_http_server.

    METHODS route_change
      IMPORTING server TYPE REF TO if_http_server.

    METHODS route_delete
      IMPORTING server TYPE REF TO if_http_server.

    METHODS route_release
      IMPORTING server TYPE REF TO if_http_server.

    METHODS route_capacity
      IMPORTING server TYPE REF TO if_http_server.

    METHODS route_whoami
      IMPORTING server TYPE REF TO if_http_server.

    METHODS route_projects
      IMPORTING server TYPE REF TO if_http_server.

    METHODS route_stub
      IMPORTING server TYPE REF TO if_http_server
                route  TYPE string.

    METHODS send_json
      IMPORTING server TYPE REF TO if_http_server
                code   TYPE i
                json   TYPE string.

    METHODS send_error
      IMPORTING server  TYPE REF TO if_http_server
                code    TYPE i
                message TYPE string.

    METHODS read_body
      IMPORTING server         TYPE REF TO if_http_server
      RETURNING VALUE(rv_json) TYPE string.

    METHODS map_receiver
      IMPORTING is_receiver  TYPE ts_receiver
      CHANGING  cs_bapicats1 TYPE bapicats1.

    METHODS map_receiver_bapicats3
      IMPORTING is_receiver  TYPE ts_receiver
      CHANGING  cs_bapicats3 TYPE bapicats3.

    METHODS time_from_hhmm
      IMPORTING iv_hhmm        TYPE string
      RETURNING VALUE(rv_tims) TYPE tims.

    METHODS to_bapi_te_catsdb
      IMPORTING iv_row          TYPE i
                is_ext          TYPE ts_ext
      RETURNING VALUE(rv_value) TYPE bapicats7-valuepart1.

    METHODS to_messages
      IMPORTING it_return         TYPE tt_bapiret2
      RETURNING VALUE(rt_messages) TYPE tt_message.

    METHODS has_errors
      IMPORTING it_return        TYPE tt_bapiret2
      RETURNING VALUE(rv_result) TYPE abap_bool.

    METHODS check_daily_limit
      IMPORTING iv_pernr         TYPE catsdb-pernr
                it_records       TYPE tt_record_in
                iv_norm_hours    TYPE catsdb-catshours
                it_exclude       TYPE tt_counter OPTIONAL
      RETURNING VALUE(rt_return) TYPE tt_bapiret2.

    METHODS split_longtext
      IMPORTING iv_row          TYPE i
                iv_text         TYPE string
      RETURNING VALUE(rt_lines) TYPE tt_bapicats8.
ENDCLASS.


CLASS zcl_cats_mcp_handler IMPLEMENTATION.

  METHOD if_http_extension~handle_request.
    DATA(lv_path) = server->request->get_header_field( name = '~path_info' ).

    TRY.
        CASE lv_path.
          WHEN '/read'.
            route_read( server ).
          WHEN '/validate'.
            route_validate( server ).
          WHEN '/insert'.
            route_insert( server ).
          WHEN '/change'.
            route_change( server ).
          WHEN '/delete'.
            route_delete( server ).
          WHEN '/release'.
            route_release( server ).
          WHEN '/capacity'.
            route_capacity( server ).
          WHEN '/whoami'.
            route_whoami( server ).
          WHEN '/projects'.
            route_projects( server ).
          WHEN OTHERS.
            send_error( server = server code = 404 message = |Неизвестный маршрут: { lv_path }| ).
        ENDCASE.
      CATCH cx_root INTO DATA(lx_error).
        send_error( server = server code = 500 message = lx_error->get_text( ) ).
    ENDTRY.
  ENDMETHOD.

  METHOD read_body.
    rv_json = server->request->get_cdata( ).
  ENDMETHOD.

  METHOD send_json.
    server->response->set_status( code = code reason = '' ).
    server->response->set_header_field( name = 'content-type' value = 'application/json; charset=utf-8' ).
    server->response->set_cdata( data = json ).
  ENDMETHOD.

  METHOD send_error.
    DATA(lv_json) = |\{"messages":[\{"type":"E","id":"MCP","number":"000","text":"{ message }"\}]\}|.
    send_json( server = server code = code json = lv_json ).
  ENDMETHOD.

  METHOD route_stub.
    send_error( server = server code = 501 message = |Маршрут { route } ещё не реализован| ).
  ENDMETHOD.

  METHOD route_read.
    DATA(lv_body) = read_body( server ).

    DATA(ls_request) = VALUE ts_read_request( ).
    /ui2/cl_json=>deserialize(
      EXPORTING
        json        = lv_body
        pretty_name = /ui2/cl_json=>pretty_mode-low_case
      CHANGING
        data        = ls_request ).

    DATA(lt_rows) = VALUE tt_cats_row( ).
    DATA(lt_status_range) = VALUE tt_status_range( FOR lv_s IN ls_request-status
                                                    ( sign = 'I' option = 'EQ' low = lv_s ) ).

    IF ls_request-status IS NOT INITIAL.
      SELECT counter, workdate, pernr,
             rkostl AS rec_cctr, raufnr AS rec_order,
             lstar AS acttype, lgart AS wagetype, meinh AS unit,
             catshours AS hours, status,
             zzrqsnb AS rqsnb, zzprjct AS prjct, zzdescr AS descr, zzorgunit AS orgunit, longtext
        FROM catsdb
        WHERE pernr = @ls_request-pernr
          AND workdate BETWEEN @ls_request-date_from AND @ls_request-date_to
          AND status IN @lt_status_range
        INTO TABLE @lt_rows.
    ELSE.
      SELECT counter, workdate, pernr,
             rkostl AS rec_cctr, raufnr AS rec_order,
             lstar AS acttype, lgart AS wagetype, meinh AS unit,
             catshours AS hours, status,
             zzrqsnb AS rqsnb, zzprjct AS prjct, zzdescr AS descr, zzorgunit AS orgunit, longtext
        FROM catsdb
        WHERE pernr = @ls_request-pernr
          AND workdate BETWEEN @ls_request-date_from AND @ls_request-date_to
        INTO TABLE @lt_rows.
    ENDIF.

    DATA(lv_total) = REDUCE catshours( INIT sum TYPE catshours
                                        FOR row IN lt_rows WHERE ( status <> c_status_cancelled )
                                        NEXT sum = sum + row-hours ).

    DATA(ls_response) = VALUE ts_read_response( rows        = lt_rows
                                                  total_hours = lv_total
                                                  messages    = VALUE #( ) ).

    DATA(lv_json) = /ui2/cl_json=>serialize( data        = ls_response
                                              pretty_name = /ui2/cl_json=>pretty_mode-low_case ).
    send_json( server = server code = 200 json = lv_json ).
  ENDMETHOD.

  METHOD route_validate.
    DATA(lv_body) = read_body( server ).

    DATA(ls_request) = VALUE ts_validate_request( norm_hours = '8' ).
    /ui2/cl_json=>deserialize(
      EXPORTING
        json        = lv_body
        pretty_name = /ui2/cl_json=>pretty_mode-low_case
      CHANGING
        data        = ls_request ).

    DATA(lt_catsrecords_in) = VALUE tt_bapicats1( ).
    DATA(lt_extensionin)    = VALUE tt_bapicats7( ).
    DATA(lt_longtext)       = VALUE tt_bapicats8( ).
    DATA(lt_return)         = VALUE tt_bapiret2( ).

    LOOP AT ls_request-records INTO DATA(ls_record).
      DATA(ls_bapicats1) = VALUE bapicats1( workdate       = ls_record-workdate
                                             employeenumber = ls_request-pernr
                                             catshours      = ls_record-hours
                                             unit           = ls_record-unit
                                             wagetype       = ls_record-wagetype
                                             acttype        = ls_record-acttype
                                             send_cctr      = ls_record-send_cctr
                                             shorttext      = ls_record-shorttext
                                             abs_att_type   = ls_record-attendance_type
                                             starttime      = time_from_hhmm( ls_record-start_time )
                                             endtime        = time_from_hhmm( ls_record-end_time )
                                             longtext       = xsdbool( ls_record-longtext IS NOT INITIAL ) ).

      map_receiver( EXPORTING is_receiver  = ls_record-receiver
                    CHANGING  cs_bapicats1 = ls_bapicats1 ).

      APPEND ls_bapicats1 TO lt_catsrecords_in.
      DATA(lv_row) = lines( lt_catsrecords_in ).
      APPEND LINES OF split_longtext( iv_row  = lv_row
                                      iv_text = ls_record-longtext ) TO lt_longtext.

      APPEND VALUE bapicats7( structure  = 'BAPI_TE_CATSDB'
                               valuepart1 = to_bapi_te_catsdb( iv_row = lv_row
                                                                is_ext = ls_record-ext ) )
             TO lt_extensionin.
    ENDLOOP.

    DATA(lt_limit_return) = check_daily_limit( iv_pernr      = ls_request-pernr
                                                it_records    = ls_request-records
                                                iv_norm_hours = ls_request-norm_hours ).

    CALL FUNCTION 'BAPI_CATIMESHEETMGR_INSERT'
      EXPORTING
        profile        = ls_request-profile
        testrun        = abap_true
      TABLES
        catsrecords_in = lt_catsrecords_in
        extensionin    = lt_extensionin
        longtext       = lt_longtext
        return         = lt_return.

    APPEND LINES OF lt_limit_return TO lt_return.

    DATA(ls_response) = VALUE ts_validate_response( messages = to_messages( lt_return ) ).

    DATA(lv_json) = /ui2/cl_json=>serialize( data        = ls_response
                                              pretty_name = /ui2/cl_json=>pretty_mode-low_case ).
    send_json( server = server code = 200 json = lv_json ).
  ENDMETHOD.

  METHOD route_insert.
    DATA(lv_body) = read_body( server ).

    DATA(ls_request) = VALUE ts_insert_request( norm_hours = '8' ).
    /ui2/cl_json=>deserialize(
      EXPORTING
        json        = lv_body
        pretty_name = /ui2/cl_json=>pretty_mode-low_case
      CHANGING
        data        = ls_request ).

    DATA(lt_existing) = VALUE tt_created_row( ).
    SELECT counter, workdate, catshours AS hours
      FROM catsdb
      WHERE pernr = @ls_request-pernr
        AND extsystem = @c_extsystem
        AND extapplication = @c_extapplication
        AND extdocumentno = @ls_request-idempotency_key
      INTO CORRESPONDING FIELDS OF TABLE @lt_existing.

    IF lt_existing IS NOT INITIAL.
      LOOP AT lt_existing ASSIGNING FIELD-SYMBOL(<ls_existing>).
        <ls_existing>-row = sy-tabix.
      ENDLOOP.

      DATA(ls_response_dup) = VALUE ts_insert_response(
        created   = lt_existing
        committed = abap_false
        messages  = VALUE #( ( type = 'S' id = 'MCP' number = '001'
                                text = 'Записи с этим idempotency_key уже созданы ранее' ) ) ).

      send_json( server = server code = 200
                 json   = /ui2/cl_json=>serialize( data        = ls_response_dup
                                                    pretty_name = /ui2/cl_json=>pretty_mode-low_case ) ).
      RETURN.
    ENDIF.

    DATA(lt_catsrecords_in)  = VALUE tt_bapicats1( ).
    DATA(lt_extensionin)     = VALUE tt_bapicats7( ).
    DATA(lt_longtext)        = VALUE tt_bapicats8( ).
    DATA(lt_catsrecords_out) = VALUE tt_bapicats2( ).
    DATA(lt_return)          = VALUE tt_bapiret2( ).

    LOOP AT ls_request-records INTO DATA(ls_record).
      DATA(ls_bapicats1) = VALUE bapicats1( workdate       = ls_record-workdate
                                             employeenumber = ls_request-pernr
                                             catshours      = ls_record-hours
                                             unit           = ls_record-unit
                                             wagetype       = ls_record-wagetype
                                             acttype        = ls_record-acttype
                                             send_cctr      = ls_record-send_cctr
                                             shorttext      = ls_record-shorttext
                                             abs_att_type   = ls_record-attendance_type
                                             starttime      = time_from_hhmm( ls_record-start_time )
                                             endtime        = time_from_hhmm( ls_record-end_time )
                                             extsystem      = c_extsystem
                                             extapplication = c_extapplication
                                             extdocumentno  = ls_request-idempotency_key
                                             longtext       = xsdbool( ls_record-longtext IS NOT INITIAL ) ).

      map_receiver( EXPORTING is_receiver  = ls_record-receiver
                    CHANGING  cs_bapicats1 = ls_bapicats1 ).

      APPEND ls_bapicats1 TO lt_catsrecords_in.
      DATA(lv_row) = lines( lt_catsrecords_in ).
      APPEND LINES OF split_longtext( iv_row  = lv_row
                                      iv_text = ls_record-longtext ) TO lt_longtext.

      APPEND VALUE bapicats7( structure  = 'BAPI_TE_CATSDB'
                               valuepart1 = to_bapi_te_catsdb( iv_row = lv_row
                                                                is_ext = ls_record-ext ) )
             TO lt_extensionin.
    ENDLOOP.

    DATA(lt_limit_return) = check_daily_limit( iv_pernr      = ls_request-pernr
                                                it_records    = ls_request-records
                                                iv_norm_hours = ls_request-norm_hours ).

    CALL FUNCTION 'BAPI_CATIMESHEETMGR_INSERT'
      EXPORTING
        profile         = ls_request-profile
        testrun         = abap_false
        release_data    = ls_request-release
      TABLES
        catsrecords_in  = lt_catsrecords_in
        extensionin     = lt_extensionin
        catsrecords_out = lt_catsrecords_out
        longtext        = lt_longtext
        return          = lt_return.

    APPEND LINES OF lt_limit_return TO lt_return.

    DATA(lv_committed) = abap_false.
    DATA(lt_created)   = VALUE tt_created_row( ).

    IF has_errors( lt_return ) = abap_false.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = abap_true.
      lv_committed = abap_true.

      lt_created = VALUE tt_created_row(
        FOR ls_out IN lt_catsrecords_out INDEX INTO lv_idx
        ( row = lv_idx counter = ls_out-counter workdate = ls_out-workdate hours = ls_out-catshours ) ).
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    ENDIF.

    DATA(ls_response) = VALUE ts_insert_response( created   = lt_created
                                                    committed = lv_committed
                                                    messages  = to_messages( lt_return ) ).

    DATA(lv_json) = /ui2/cl_json=>serialize( data        = ls_response
                                              pretty_name = /ui2/cl_json=>pretty_mode-low_case ).
    send_json( server = server code = 200 json = lv_json ).
  ENDMETHOD.

  METHOD route_change.
    DATA(lv_body) = read_body( server ).

    DATA(ls_request) = VALUE ts_change_request( norm_hours = '8' ).
    /ui2/cl_json=>deserialize(
      EXPORTING
        json        = lv_body
        pretty_name = /ui2/cl_json=>pretty_mode-low_case
      CHANGING
        data        = ls_request ).

    DATA(lt_catsrecords_in)  = VALUE tt_bapicats3( ).
    DATA(lt_extensionin)     = VALUE tt_bapicats7( ).
    DATA(lt_longtext)        = VALUE tt_bapicats8( ).
    DATA(lt_catsrecords_out) = VALUE tt_bapicats2( ).
    DATA(lt_return)          = VALUE tt_bapiret2( ).

    LOOP AT ls_request-records INTO DATA(ls_record).
      DATA(ls_bapicats3) = VALUE bapicats3( counter        = ls_record-counter
                                             workdate       = ls_record-workdate
                                             employeenumber = ls_request-pernr
                                             catshours      = ls_record-hours
                                             unit           = ls_record-unit
                                             wagetype       = ls_record-wagetype
                                             acttype        = ls_record-acttype
                                             send_cctr      = ls_record-send_cctr
                                             shorttext      = ls_record-shorttext
                                             abs_att_type   = ls_record-attendance_type
                                             starttime      = time_from_hhmm( ls_record-start_time )
                                             endtime        = time_from_hhmm( ls_record-end_time )
                                             longtext       = xsdbool( ls_record-longtext IS NOT INITIAL ) ).

      map_receiver_bapicats3( EXPORTING is_receiver  = ls_record-receiver
                               CHANGING  cs_bapicats3 = ls_bapicats3 ).

      APPEND ls_bapicats3 TO lt_catsrecords_in.
      DATA(lv_row) = lines( lt_catsrecords_in ).
      APPEND LINES OF split_longtext( iv_row  = lv_row
                                      iv_text = ls_record-longtext ) TO lt_longtext.

      APPEND VALUE bapicats7( structure  = 'BAPI_TE_CATSDB'
                               valuepart1 = to_bapi_te_catsdb( iv_row = lv_row
                                                                is_ext = ls_record-ext ) )
             TO lt_extensionin.
    ENDLOOP.

    DATA(lt_limit_return) = check_daily_limit(
      iv_pernr      = ls_request-pernr
      it_records    = VALUE #( FOR ls_changed IN ls_request-records
                               ( workdate = ls_changed-workdate hours = ls_changed-hours ) )
      iv_norm_hours = ls_request-norm_hours
      it_exclude    = VALUE #( FOR ls_changed IN ls_request-records ( ls_changed-counter ) ) ).

    CALL FUNCTION 'BAPI_CATIMESHEETMGR_CHANGE'
      EXPORTING
        profile         = ls_request-profile
        testrun         = ls_request-test
      TABLES
        catsrecords_in  = lt_catsrecords_in
        extensionin     = lt_extensionin
        catsrecords_out = lt_catsrecords_out
        longtext        = lt_longtext
        return          = lt_return.

    APPEND LINES OF lt_limit_return TO lt_return.

    DATA(lv_committed) = abap_false.

    IF ls_request-test = abap_false.
      IF has_errors( lt_return ) = abap_false.
        CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
          EXPORTING
            wait = abap_true.
        lv_committed = abap_true.
      ELSE.
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      ENDIF.
    ENDIF.

    DATA(lt_changed) = VALUE tt_changed_row(
      FOR ls_out IN lt_catsrecords_out INDEX INTO lv_idx
      ( row = lv_idx counter = ls_out-counter workdate = ls_out-workdate status = ls_out-status ) ).

    DATA(ls_response) = VALUE ts_change_response( changed   = lt_changed
                                                    committed = lv_committed
                                                    messages  = to_messages( lt_return ) ).

    DATA(lv_json) = /ui2/cl_json=>serialize( data        = ls_response
                                              pretty_name = /ui2/cl_json=>pretty_mode-low_case ).
    send_json( server = server code = 200 json = lv_json ).
  ENDMETHOD.

  METHOD route_delete.
    DATA(lv_body) = read_body( server ).

    DATA(ls_request) = VALUE ts_delete_request( ).
    /ui2/cl_json=>deserialize(
      EXPORTING
        json        = lv_body
        pretty_name = /ui2/cl_json=>pretty_mode-low_case
      CHANGING
        data        = ls_request ).

    DATA(lt_catsrecords) = VALUE tt_bapicats4( ).
    DATA(lt_return)       = VALUE tt_bapiret2( ).

    LOOP AT ls_request-counters INTO DATA(lv_counter).
      APPEND VALUE bapicats4( counter = lv_counter ) TO lt_catsrecords.
    ENDLOOP.

    CALL FUNCTION 'BAPI_CATIMESHEETMGR_DELETE'
      EXPORTING
        testrun     = ls_request-test
      TABLES
        catsrecords = lt_catsrecords
        return      = lt_return.

    DATA(lv_committed) = abap_false.

    IF ls_request-test = abap_false.
      IF has_errors( lt_return ) = abap_false.
        CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
          EXPORTING
            wait = abap_true.
        lv_committed = abap_true.
      ELSE.
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      ENDIF.
    ENDIF.

    DATA(lt_deleted) = VALUE tt_deleted_row( ).
    IF lv_committed = abap_true.
      lt_deleted = VALUE tt_deleted_row(
        FOR lv_c IN ls_request-counters INDEX INTO lv_idx
        ( row = lv_idx counter = lv_c ) ).
    ENDIF.

    DATA(ls_response) = VALUE ts_delete_response( deleted   = lt_deleted
                                                    committed = lv_committed
                                                    messages  = to_messages( lt_return ) ).

    DATA(lv_json) = /ui2/cl_json=>serialize( data        = ls_response
                                              pretty_name = /ui2/cl_json=>pretty_mode-low_case ).
    send_json( server = server code = 200 json = lv_json ).
  ENDMETHOD.

  METHOD route_release.
    DATA(lv_body) = read_body( server ).

    DATA(ls_request) = VALUE ts_release_request( ).
    /ui2/cl_json=>deserialize(
      EXPORTING
        json        = lv_body
        pretty_name = /ui2/cl_json=>pretty_mode-low_case
      CHANGING
        data        = ls_request ).

    DATA(lt_rows) = VALUE tt_catsdb_full( ).
    DATA(lt_counter_range) = VALUE tt_counter_range( FOR lv_c IN ls_request-counters
                                                      ( sign = 'I' option = 'EQ' low = lv_c ) ).

    IF ls_request-counters IS NOT INITIAL.
      SELECT counter, workdate, pernr,
             catshours AS hours, meinh AS unit, lgart AS wagetype, lstar AS acttype,
             skostl AS send_cctr, rkostl AS rec_cctr, kokrs AS co_area, raufnr AS rec_order,
             rkdauf AS sales_ord, rkdpos AS sales_item, sebeln AS po_number, sebelp AS po_item,
             ltxa1 AS shorttext, awart AS att_type, beguz AS start_time, enduz AS end_time,
             zzrqsnb AS rqsnb, zzprjct AS prjct, zzdescr AS descr, zzorgunit AS orgunit
        FROM catsdb
        WHERE counter IN @lt_counter_range
          AND status = '10'
        INTO TABLE @lt_rows.
    ELSE.
      SELECT counter, workdate, pernr,
             catshours AS hours, meinh AS unit, lgart AS wagetype, lstar AS acttype,
             skostl AS send_cctr, rkostl AS rec_cctr, kokrs AS co_area, raufnr AS rec_order,
             rkdauf AS sales_ord, rkdpos AS sales_item, sebeln AS po_number, sebelp AS po_item,
             ltxa1 AS shorttext, awart AS att_type, beguz AS start_time, enduz AS end_time,
             zzrqsnb AS rqsnb, zzprjct AS prjct, zzdescr AS descr, zzorgunit AS orgunit
        FROM catsdb
        WHERE pernr = @ls_request-pernr
          AND workdate BETWEEN @ls_request-date_from AND @ls_request-date_to
          AND status = '10'
        INTO TABLE @lt_rows.
    ENDIF.

    DATA(lt_catsrecords_in)  = VALUE tt_bapicats3( ).
    DATA(lt_extensionin)     = VALUE tt_bapicats7( ).
    DATA(lt_catsrecords_out) = VALUE tt_bapicats2( ).
    DATA(lt_return)          = VALUE tt_bapiret2( ).

    LOOP AT lt_rows INTO DATA(ls_row).
      APPEND VALUE bapicats3( counter        = ls_row-counter
                              workdate       = ls_row-workdate
                              employeenumber = ls_row-pernr
                              catshours      = ls_row-hours
                              unit           = ls_row-unit
                              wagetype       = ls_row-wagetype
                              acttype        = ls_row-acttype
                              send_cctr      = ls_row-send_cctr
                              rec_cctr       = ls_row-rec_cctr
                              co_area        = ls_row-co_area
                              rec_order      = ls_row-rec_order
                              recsaleord     = ls_row-sales_ord
                              recitem        = ls_row-sales_item
                              po_number      = ls_row-po_number
                              po_item        = ls_row-po_item
                              shorttext      = ls_row-shorttext
                              abs_att_type   = ls_row-att_type
                              starttime      = ls_row-start_time
                              endtime        = ls_row-end_time )
             TO lt_catsrecords_in.

      APPEND VALUE bapicats7( structure  = 'BAPI_TE_CATSDB'
                               valuepart1 = to_bapi_te_catsdb( iv_row = sy-tabix
                                                                is_ext = VALUE ts_ext( rqsnb   = ls_row-rqsnb
                                                                                       prjct   = ls_row-prjct
                                                                                       descr   = ls_row-descr
                                                                                       orgunit = ls_row-orgunit ) ) )
             TO lt_extensionin.
    ENDLOOP.

    CALL FUNCTION 'BAPI_CATIMESHEETMGR_CHANGE'
      EXPORTING
        release_data    = abap_true
      TABLES
        catsrecords_in  = lt_catsrecords_in
        extensionin     = lt_extensionin
        catsrecords_out = lt_catsrecords_out
        return          = lt_return.

    DATA(lv_committed) = abap_false.

    IF lt_catsrecords_in IS NOT INITIAL.
      IF has_errors( lt_return ) = abap_false.
        CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
          EXPORTING
            wait = abap_true.
        lv_committed = abap_true.
      ELSE.
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      ENDIF.
    ENDIF.

    DATA(lt_released) = VALUE tt_released_row(
      FOR ls_out IN lt_catsrecords_out INDEX INTO lv_idx
      ( row = lv_idx counter = ls_out-counter workdate = ls_out-workdate status = ls_out-status ) ).

    DATA(ls_response) = VALUE ts_release_response( released  = lt_released
                                                     committed = lv_committed
                                                     messages  = to_messages( lt_return ) ).

    DATA(lv_json) = /ui2/cl_json=>serialize( data        = ls_response
                                              pretty_name = /ui2/cl_json=>pretty_mode-low_case ).
    send_json( server = server code = 200 json = lv_json ).
  ENDMETHOD.

  METHOD route_capacity.
    DATA(lv_body) = read_body( server ).

    DATA(ls_request) = VALUE ts_capacity_request( norm_hours = '8' ).
    /ui2/cl_json=>deserialize(
      EXPORTING
        json        = lv_body
        pretty_name = /ui2/cl_json=>pretty_mode-low_case
      CHANGING
        data        = ls_request ).

    DATA(lt_booked) = VALUE tt_booked_day( ).
    SELECT workdate, SUM( catshours ) AS hours
      FROM catsdb
      WHERE pernr = @ls_request-pernr
        AND workdate BETWEEN @ls_request-date_from AND @ls_request-date_to
        AND status <> @c_status_cancelled
      GROUP BY workdate
      INTO TABLE @lt_booked.

    DATA(lt_days)       = VALUE tt_capacity_day( ).
    DATA(lv_total_free) = VALUE catsdb-catshours( ).
    DATA(lv_date)       = ls_request-date_from.

    WHILE lv_date <= ls_request-date_to.
      DATA(lv_flag) = VALUE scal-indicator( ).
      CALL FUNCTION 'DATE_CONVERT_TO_FACTORYDATE'
        EXPORTING
          date                 = lv_date
          factory_calendar_id  = c_calendar
        IMPORTING
          workingday_indicator = lv_flag
        EXCEPTIONS
          date_invalid               = 1
          date_before_range          = 2
          date_after_range           = 3
          factory_calendar_not_found = 4
          OTHERS                     = 5.

      DATA(lv_is_workday) = xsdbool( sy-subrc = 0 AND lv_flag = space ).
      DATA(lv_booked)     = VALUE catsdb-catshours( lt_booked[ workdate = lv_date ]-hours OPTIONAL ).
      DATA(lv_norm)       = COND catsdb-catshours( WHEN lv_is_workday = abap_true THEN ls_request-norm_hours ELSE 0 ).
      DATA(lv_free)       = lv_norm - lv_booked.

      APPEND VALUE ts_capacity_day( date       = lv_date
                                     is_workday = lv_is_workday
                                     booked     = lv_booked
                                     free       = lv_free )
             TO lt_days.

      lv_total_free = lv_total_free + lv_free.
      lv_date       = lv_date + 1.
    ENDWHILE.

    DATA(ls_response) = VALUE ts_capacity_response( days       = lt_days
                                                      norm_hours = ls_request-norm_hours
                                                      calendar   = c_calendar
                                                      total_free = lv_total_free ).

    DATA(lv_json) = /ui2/cl_json=>serialize( data        = ls_response
                                              pretty_name = /ui2/cl_json=>pretty_mode-low_case ).
    send_json( server = server code = 200 json = lv_json ).
  ENDMETHOD.

  METHOD map_receiver.
    IF is_receiver-order IS NOT INITIAL.
      cs_bapicats1-rec_order = is_receiver-order.
    ELSEIF is_receiver-cost_center IS NOT INITIAL.
      cs_bapicats1-rec_cctr = is_receiver-cost_center.
      cs_bapicats1-co_area  = is_receiver-co_area.
    ELSEIF is_receiver-wbs IS NOT INITIAL.
      cs_bapicats1-wbs_element = is_receiver-wbs.
    ELSEIF is_receiver-network IS NOT INITIAL.
      cs_bapicats1-network      = is_receiver-network.
      cs_bapicats1-activity     = is_receiver-activity.
      cs_bapicats1-sub_activity = is_receiver-sub_activity.
    ELSEIF is_receiver-sales_order IS NOT INITIAL.
      cs_bapicats1-recsaleord = is_receiver-sales_order.
      cs_bapicats1-recitem    = is_receiver-item.
    ELSEIF is_receiver-purchase_order IS NOT INITIAL.
      cs_bapicats1-po_number = is_receiver-purchase_order.
      cs_bapicats1-po_item   = is_receiver-item.
    ENDIF.
  ENDMETHOD.

  METHOD map_receiver_bapicats3.
    IF is_receiver-order IS NOT INITIAL.
      cs_bapicats3-rec_order = is_receiver-order.
    ELSEIF is_receiver-cost_center IS NOT INITIAL.
      cs_bapicats3-rec_cctr = is_receiver-cost_center.
      cs_bapicats3-co_area  = is_receiver-co_area.
    ELSEIF is_receiver-wbs IS NOT INITIAL.
      cs_bapicats3-wbs_element = is_receiver-wbs.
    ELSEIF is_receiver-network IS NOT INITIAL.
      cs_bapicats3-network      = is_receiver-network.
      cs_bapicats3-activity     = is_receiver-activity.
      cs_bapicats3-sub_activity = is_receiver-sub_activity.
    ELSEIF is_receiver-sales_order IS NOT INITIAL.
      cs_bapicats3-recsaleord = is_receiver-sales_order.
      cs_bapicats3-recitem    = is_receiver-item.
    ELSEIF is_receiver-purchase_order IS NOT INITIAL.
      cs_bapicats3-po_number = is_receiver-purchase_order.
      cs_bapicats3-po_item   = is_receiver-item.
    ENDIF.
  ENDMETHOD.

  METHOD time_from_hhmm.
    IF strlen( iv_hhmm ) <> 5.
      RETURN.
    ENDIF.
    rv_tims = iv_hhmm(2) && iv_hhmm+3(2) && '00'.
  ENDMETHOD.

  METHOD to_bapi_te_catsdb.
    DATA(ls_custom) = VALUE bapi_te_catsdb( row       = iv_row
                                             zzprjct   = is_ext-prjct
                                             zzrqsnb   = is_ext-rqsnb
                                             zzdescr   = is_ext-descr
                                             zzorgunit = is_ext-orgunit ).
    rv_value = ls_custom.
  ENDMETHOD.

  METHOD to_messages.
    rt_messages = VALUE #( FOR ls_return IN it_return
                            ( type   = ls_return-type
                              id     = ls_return-id
                              number = ls_return-number
                              text   = ls_return-message
                              row    = ls_return-row ) ).
  ENDMETHOD.

  METHOD has_errors.
    rv_result = xsdbool( line_exists( it_return[ type = 'E' ] ) OR line_exists( it_return[ type = 'A' ] ) ).
  ENDMETHOD.

  METHOD check_daily_limit.
    CHECK it_records IS NOT INITIAL.

    DATA(lt_new_by_day) = VALUE tt_booked_day( ).
    LOOP AT it_records INTO DATA(ls_record).
      READ TABLE lt_new_by_day WITH KEY workdate = ls_record-workdate ASSIGNING FIELD-SYMBOL(<ls_new_day>).
      IF sy-subrc = 0.
        <ls_new_day>-hours = <ls_new_day>-hours + ls_record-hours.
      ELSE.
        APPEND VALUE ts_booked_day( workdate = ls_record-workdate hours = ls_record-hours ) TO lt_new_by_day.
      ENDIF.
    ENDLOOP.

    DATA(lt_date_range) = VALUE tt_workdate_range( FOR ls_range_day IN lt_new_by_day
                                                    ( sign = 'I' option = 'EQ' low = ls_range_day-workdate ) ).

    DATA(lt_rows) = VALUE tt_hours_row( ).
    SELECT counter, workdate, catshours AS hours
      FROM catsdb
      WHERE pernr = @iv_pernr
        AND workdate IN @lt_date_range
        AND status <> @c_status_cancelled
      INTO TABLE @lt_rows.

    LOOP AT lt_new_by_day INTO DATA(ls_new_day).
      DATA(lv_existing) = REDUCE catsdb-catshours( INIT sum TYPE catsdb-catshours
                                                    FOR ls_row IN lt_rows WHERE ( workdate = ls_new_day-workdate )
                                                    NEXT sum = sum + COND catsdb-catshours( WHEN line_exists( it_exclude[ table_line = ls_row-counter ] )
                                                                                            THEN 0
                                                                                            ELSE ls_row-hours ) ).
      DATA(lv_total)    = lv_existing + ls_new_day-hours.

      IF lv_total > iv_norm_hours.
        APPEND VALUE bapiret2( type    = 'E'
                                id      = 'MCP'
                                number  = '002'
                                message = |Превышена дневная норма { iv_norm_hours DECIMALS = 2 } ч на { ls_new_day-workdate DATE = ISO }: | &&
                                          |уже { lv_existing DECIMALS = 2 } + новые { ls_new_day-hours DECIMALS = 2 } = { lv_total DECIMALS = 2 }| )
               TO rt_return.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD split_longtext.
    CHECK iv_text IS NOT INITIAL.

    SPLIT iv_text AT cl_abap_char_utilities=>newline INTO TABLE DATA(lt_paragraphs).

    LOOP AT lt_paragraphs INTO DATA(lv_paragraph).
      DATA(lv_rest)   = replace( val = lv_paragraph sub = |\r| with = `` occ = 0 ).
      DATA(lv_format) = CONV bapicats8-format_col( '*' ).
      DO.
        DATA(lv_len) = nmin( val1 = strlen( lv_rest ) val2 = 132 ).
        APPEND VALUE bapicats8( row        = iv_row
                                format_col = lv_format
                                text_line  = substring( val = lv_rest len = lv_len ) )
               TO rt_lines.
        lv_rest   = substring( val = lv_rest off = lv_len ).
        lv_format = '='.
        IF lv_rest IS INITIAL.
          EXIT.
        ENDIF.
      ENDDO.
    ENDLOOP.
  ENDMETHOD.

  METHOD route_whoami.
    DATA(ls_response) = VALUE ts_whoami_response( user = sy-uname ).

    SELECT SINGLE pernr
      FROM pa0105
      WHERE subty = '0001'
        AND usrid = @sy-uname
        AND begda <= @sy-datum
        AND endda >= @sy-datum
      INTO @ls_response-pernr.

    IF sy-subrc <> 0.
      ls_response-messages = VALUE #( ( type = 'E' id = 'MCP' number = '003'
                                        text = |Пользователю { sy-uname } не присвоен табельный номер (ИТ 0105, подтип 0001)| ) ).
    ELSE.
      SELECT SINGLE ename, orgeh
        FROM pa0001
        WHERE pernr = @ls_response-pernr
          AND begda <= @sy-datum
          AND endda >= @sy-datum
        INTO (@ls_response-name, @ls_response-orgeh).

      SELECT SINGLE orgtx
        FROM t527x
        WHERE orgeh = @ls_response-orgeh
          AND sprsl = @sy-langu
          AND begda <= @sy-datum
          AND endda >= @sy-datum
        INTO @ls_response-orgunit.
    ENDIF.

    DATA(lv_json) = /ui2/cl_json=>serialize( data        = ls_response
                                              pretty_name = /ui2/cl_json=>pretty_mode-low_case ).
    send_json( server = server code = 200 json = lv_json ).
  ENDMETHOD.

  METHOD route_projects.
    DATA(lv_body) = read_body( server ).

    DATA(ls_request) = VALUE ts_projects_request( ).
    /ui2/cl_json=>deserialize(
      EXPORTING
        json        = lv_body
        pretty_name = /ui2/cl_json=>pretty_mode-low_case
      CHANGING
        data        = ls_request ).

    DATA(ls_response) = VALUE ts_projects_response( ).

    SELECT p~prjct, t~prjct_t AS text
      FROM zbtprjct AS p
      LEFT JOIN zbtprjctt AS t ON t~prjct = p~prjct
                              AND t~spras = @sy-langu
      WHERE p~active = @abap_true
      ORDER BY p~prjct
      INTO TABLE @ls_response-projects.

    IF ls_request-prjct IS NOT INITIAL.
      DELETE ls_response-projects WHERE prjct <> ls_request-prjct.

      IF ls_response-projects IS INITIAL.
        ls_response-messages = VALUE #( ( type = 'E' id = 'MCP' number = '004'
                                          text = |Проект { ls_request-prjct } не найден или не активен| ) ).
      ELSE.
        SELECT r~rqsnb, t~rqsnm AS text, r~fcbdt AS date_from, r~fcedt AS date_to, r~is_rejected AS rejected
          FROM zbtproject AS r
          LEFT JOIN zbtreqspt AS t ON t~prjct = r~prjct
                                  AND t~rqsnb = r~rqsnb
                                  AND t~spras = @sy-langu
          WHERE r~prjct = @ls_request-prjct
            AND r~rqsdl = @space
          ORDER BY r~rqsnb
          INTO TABLE @ls_response-requests.
      ENDIF.
    ELSEIF ls_request-search IS NOT INITIAL.
      DELETE ls_response-projects WHERE NOT ( prjct CS ls_request-search OR text CS ls_request-search ).
    ENDIF.

    DATA(lv_json) = /ui2/cl_json=>serialize( data        = ls_response
                                              pretty_name = /ui2/cl_json=>pretty_mode-low_case ).
    send_json( server = server code = 200 json = lv_json ).
  ENDMETHOD.

ENDCLASS.
