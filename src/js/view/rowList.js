/**
 * @fileoverview RowList View
 * @author NHN Ent. FE Development Team
 */
'use strict';

var View = require('../base/view');
var RowPainter = require('./painter/row');

/**
 * RowList View
 * @module view/rowList
 */
var RowList = View.extend(/**@lends module:view/rowList.prototype */{
    /**
     * 초기화 함수
     * @constructs
     * @extends module:baes/view
     * @param {object} options 옵션 객체
     *      @param {string} [options.whichSide='R']   어느 영역에 속하는 rowList 인지 여부. 'L|R' 중 하나를 지정한다.
     */
    initialize: function(options) {
        var focusModel, renderModel, whichSide;

        View.prototype.initialize.apply(this, arguments);

        whichSide = (options && options.whichSide) || 'R';
        this.setOwnProperties({
            whichSide: whichSide,
            bodyView: options.bodyView,
            columnModelList: this.grid.columnModel.getVisibleColumnModelList(whichSide),
            sortOptions: null,
            renderedRowKeys: null,
            rowPainter: null
        });
        this.renderCount = 0;
        this._createRowPainter();
        this._delegateTableEventsFromBody();
        this._focusClipboardDebounced = _.debounce(this._focusClipboard, 10);

        focusModel = this.grid.focusModel;
        renderModel = this.grid.renderModel;
        this.listenTo(this.collection, 'change', this._onModelChange)
            .listenTo(focusModel, 'select', this._onSelect)
            .listenTo(focusModel, 'unselect', this._onUnselect)
            .listenTo(focusModel, 'focus', this._onFocus)
            .listenTo(focusModel, 'blur', this._onBlur)
            .listenTo(renderModel, 'rowListChanged', this.render);
            // .listenTo(renderModel, 'rowListChanged', _.throttle(_.bind(this.render, this), 300));
    },

    /**
     * Rendering 에 사용할 RowPainter Instance 를 생성한다.
     * @private
     */
    _createRowPainter: function() {
        this.rowPainter = new RowPainter({
            grid: this.grid,
            columnModelList: this.columnModelList
        });
    },

    /**
     * 기존에 생성되어 있던 TR요소들 중 새로 렌더링할 데이터와 중복되지 않은 목록의 TR요소만 삭제한다.
     * @param {array} dupRowKeys 중복된 데이터의 rowKey 목록
     */
    _removeOldRows: function(dupRowKeys) {
        var firstIdx = _.indexOf(this.renderedRowKeys, dupRowKeys[0]),
            lastIdx = _.indexOf(this.renderedRowKeys, _.last(dupRowKeys)),
            $rows = this.$el.children('tr');

        $rows.slice(0, firstIdx).remove();
        $rows.slice(lastIdx + 1).remove();
    },

    /**
     * 기존의 렌더링된 데이터와 중복되지 않은 목록에 대해서만 TR요소를 추가한다.
     * @param {array} rowKeys 렌더링할 데이터의 rowKey 목록
     * @param {array} dupRowKeys 중복된 데이터의 rowKey 목록
     */
    _appendNewRows: function(rowKeys, dupRowKeys) {
        var beforeRows = this.collection.slice(0, _.indexOf(rowKeys, dupRowKeys[0])),
            afterRows = this.collection.slice(_.indexOf(rowKeys, _.last(dupRowKeys)) + 1);

        this.$el.prepend(this._getRowsHtml(beforeRows));
        this.$el.append(this._getRowsHtml(afterRows));
    },

    /**
     * 전체 행목록을 갱신한다.
     */
    _resetRows: function() {
        var html = this._getRowsHtml(this.collection.models),
            $tbody;

        if (RowList.isInnerHtmlOfTbodyReadOnly) {
            $tbody = this.bodyView.redrawTable(html);
            this.setElement($tbody, false); // table이 다시 생성되었기 때문에 tbody의 참조를 갱신해준다.

            // IE7에서 레이아웃이 틀어지는 현상 방지
            if (ne.util.browser.msie && ne.util.browser.version <= 7) {
                $tbody.width($tbody.width());
            }
        } else {
            // IE의 호환성 보기를 사용하면 브라우저 검출이 정확하지 않기 때문에, try/catch로 방어코드를 추가함.
            try {
                this.$el[0].innerHTML = html;
            } catch (e) {
                RowList.isInnerHtmlOfTbodyReadOnly = true;
                this._resetRows();
            }
        }
    },

    /**
     * 행데이터 목록을 받아, HTML 문자열을 생성해서 반환한다.
     * @param {Model.Row[]} rows - 행데이터 목록
     * @return {string} 생성된 HTML 문자열
     */
    _getRowsHtml: function(rows) {
        return _.map(rows, this.rowPainter.getHtml, this.rowPainter).join('');
    },

    /**
     * timeout을 사용해 일정 시간이 지난 후 포커스를 Clipboard로 옮긴다.
     */
    _focusClipboard: function() {
        try {
            this.grid.focusClipboard();
        } catch (e) {
            // prevent Error from running test cases (caused by setTimeout in _.debounce())
        }
    },

    /**
     * tr 엘리먼트를 찾아서 반환한다.
     * @param {(string|number)} rowKey rowKey 대상의 키값
     * @return {jquery} 조회한 tr jquery 엘리먼트
     * @private
     */
    _getRowElement: function(rowKey) {
        return this.$el.find('tr[key="' + rowKey + '"]');
    },

    /**
     * focusModel 의 select 이벤트 발생시 이벤트 핸들러
     * @param {(Number|String)} rowKey 대상의 키값
     * @private
     */
    _onSelect: function(rowKey) {
        this._setCssSelect(rowKey, true);
    },

    /**
     * focusModel 의 unselect 이벤트 발생시 이벤트 핸들러
     * @param {(Number|String)} rowKey 대상의 키값
     * @private
     */
    _onUnselect: function(rowKey) {
        this._setCssSelect(rowKey, false);
    },

    /**
     * 인자로 넘어온 rowKey 에 해당하는 행(각 TD)에 Select 디자인 클래스를 적용한다.
     * @param {(Number|String)} rowKey 대상의 키값
     * @param {Boolean} isSelected  css select 를 수행할지 unselect 를 수행할지 여부
     * @private
     */
    _setCssSelect: function(rowKey, isSelected) {
        var grid = this.grid,
            columnModelList = this.columnModelList,
            columnName,
            $trCache = {},
            $tr, $td,
            mainRowKey;

        _.each(columnModelList, function(columnModel) {
            columnName = columnModel['columnName'];
            mainRowKey = grid.dataModel.getMainRowKey(rowKey, columnName);

            $trCache[mainRowKey] = $trCache[mainRowKey] || this._getRowElement(mainRowKey);
            $tr = $trCache[mainRowKey];
            $td = $tr.find('td[columnname="' + columnName + '"]');
            if ($td.length) {
                $td.toggleClass('selected', isSelected);
            }
        }, this);
    },

    /**
     * focusModel 의 blur 이벤트 발생시 해당 $td 를 찾고, focus 클래스를 제거한다.
     * @param {(Number|String)} rowKey 대상의 키값
     * @param {String} columnName 컬럼명
     * @private
     */
    _onBlur: function(rowKey, columnName) {
        var $td = this.grid.getElement(rowKey, columnName);
        if ($td.length) {
            $td.removeClass('focused');
        }
    },

    /**
     * focusModel 의 _onFocus 이벤트 발생시 해당 $td 를 찾고, focus 클래스를 추가한다.
     * @param {(Number|String)} rowKey 대상의 키값
     * @param {String} columnName 컬럼명
     * @private
     */
    _onFocus: function(rowKey, columnName) {
        var $td = this.grid.getElement(rowKey, columnName);
        if ($td.length) {
            $td.addClass('focused');
        }
    },

    /**
     * 랜더링한다.
     * @param {boolean} isModelChanged - 모델이 변경된 경우(add, remove..) true, 아니면(스크롤 변경 등) false
     * @return {View.RowList} this 객체
     */
    render: function(isModelChanged) {
        var rowKeys = this.collection.pluck('rowKey'),
            dupRowKeys;

        this.bodyView.resetContainerArea();

        if (isModelChanged) {
            this._resetRows();
        } else {
            dupRowKeys = _.intersection(rowKeys, this.renderedRowKeys);
            if (_.isEmpty(rowKeys) || _.isEmpty(dupRowKeys) ||
                // 중복된 데이터가 70% 미만일 경우에는 성능을 위해 innerHTML을 사용.
                (dupRowKeys.length / rowKeys.length < 0.7)) {
                this._resetRows();
            } else {
                this._removeOldRows(dupRowKeys);
                this._appendNewRows(rowKeys, dupRowKeys);
            }
        }

        this.renderedRowKeys = rowKeys;
        this._focusClipboardDebounced();
        this._showLayer();

        return this;
    },

    /**
     * 테이블 내부(TR,TD)에서 발생하는 이벤트를 View.Layout.Body에게 넘겨 해당 요소들에게 위임하도록 설정한다.
     * @private
     */
    _delegateTableEventsFromBody: function() {
        this.bodyView.attachTableEventHandler('tr', this.rowPainter.getEventHandlerInfo());

        _.each(this.rowPainter.getCellPainters(), function(painter, editType) {
            var selector = 'td[edit-type=' + editType + ']',
                handlerInfo = painter.getEventHandlerInfo();

            this.bodyView.attachTableEventHandler(selector, handlerInfo);
        }, this);
    },

    /**
     * modelChange 이벤트 발생시 실행되는 핸들러 함수.
     * @param {Model.Row} model Row 모델 객체
     * @private
     */
    _onModelChange: function(model) {
        var $tr = this._getRowElement(model.get('rowKey'));
        this.rowPainter.onModelChange(model, $tr);
    },

    /**
     * 데이터가 있다면 Layer 를 노출하고, 없는 경우 데이터 없음 레이어를 노출한다.
     * @private
     */
    _showLayer: function() {
        if (this.grid.dataModel.length) {
            this.grid.hideGridLayer();
        } else {
            this.grid.showGridLayer('empty');
        }
    }
},
{
    /**
     * tbody 요소의 innerHTML이 읽기전용인지 여부
     * @memberof RowList
     * @static
     */
    isInnerHtmlOfTbodyReadOnly: (ne.util.browser.msie && ne.util.browser.version <= 9)
});

module.exports = RowList;