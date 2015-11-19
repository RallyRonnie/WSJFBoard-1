Ext.define('Rally.ui.bulk.RecordMenuFix', {
    override: 'Rally.ui.menu.bulk.RecordMenu',
    _getMenuItems: function() {
        var records = this.getRecords();
        var items = this.callParent(arguments);
        items.push({
             xtype: 'wsjfBulkSetRisk',
             id: 'wsjfBulkSetRisk'
         });
        items.push({
             xtype: 'wsjfBulkSetValue',
             id: 'wsjfBulkSetValue'
        });
        items.push({
             xtype: 'wsjfBulkSetTime',
             id: 'wsjfBulkSetTime'
        });
        items.push({
             xtype: 'wsjfBulkSetSize',
             id: 'wsjfBulkSetSize'
        });

        _.each(items, function (item) {
            Ext.apply(item, {
                records: records,
                store: this.store,
                onBeforeAction: this.onBeforeAction,
                onActionComplete: this.onActionComplete,
                context: this.getContext()
            });
        }, this);

        return items;
     }
});


Ext.define('CustomApp', {
    extend: 'Rally.app.TimeboxScopedApp',
    componentCls: 'app',

    scopeType: 'release',
    settingsScope: 'project',

    stateful: true,

    onTimeboxScopeChange: function(newTimeboxScope) {
        this.callParent(arguments);
        this._startApp(this);
    },

    getSettingsFields: function() {
        return [
            {
                xtype: 'textarea',
                fieldLabel: 'Query',
                name: 'query',
                anchor: '100%',
                cls: 'query-field',
                margin: '0 70 0 0',
                plugins: [
                    {
                        ptype: 'rallyhelpfield',
                        helpId: 194
                    },
                    'rallyfieldvalidationui'
                ],
                validateOnBlur: false,
                validateOnChange: false,
                validator: function(value) {
                    try {
                        if (value) {
                            Rally.data.wsapi.Filter.fromQueryString(value);
                        }
                        return true;
                    } catch (e) {
                        return e.message;
                    }
                }
            },
            {
                xtype: 'rallycheckboxfield',
                fieldLabel: 'Use Preliminary Estimate',
                labelWidth: 200,
                name: 'usePrelim'
            },
            {
                xtype: 'rallycheckboxfield',
                fieldLabel: 'Overwrite WSJF on load',
                labelWidth: 200,
                name: 'useWSJFOverLoad'
            },
            {
                xtype: 'rallycheckboxfield',
                fieldLabel: 'Make WSJF field read-only',
                labelWidth: 200,
                name: 'useWSJFReadOnly'
            },
            {
                xtype: 'rallycheckboxfield',
                fieldLabel: 'Auto-sort on change',
                labelWidth: 200,
                name: 'useWSJFAutoSort'
            }
        ];
    },


    launch: function() {

        var context = this.getContext();
        var app = this;

        this.add( { xtype: 'container',
            id: 'headerBox',
            layout: 'column',
            border: 5,
            style: {
                borderColor: Rally.util.Colors.cyan,
                borderStyle: 'solid'
            }
        }
        );

        //We should prevent re-ordering of rank if we have sub-sampled by release
        //It makes for a confusing result otherwise
        var timeboxscope = this.getContext().getTimeboxScope();
            if (!timeboxscope) {
                Ext.getCmp('headerBox').add( {
                    xtype: 'rallybutton',
                    id: 'MakeItSo',
                    margin: 10,
                    text: 'Commit WSJF as Rank',
                    handler: this._storeRecords,
                    scope: this
                });

                //Add the option to commit first record to top of global rank.
                Ext.getCmp('headerBox').add( {
                    xtype: 'rallycheckboxfield',
                    fieldLabel: 'Override global rank',
                    id: 'globalCheck',
                    value: false,
                    margin: 10
                });

            }

        Ext.getCmp('headerBox').add( {
            xtype: 'rallyportfolioitemtypecombobox',
            labelWidth: 150,
            fieldLabel: 'Choose portfolio type:',
            id: 'itemType',
            margin: 10,
            listeners: {
                ready: function() { app._startApp(app); },
                select: function() { app._startApp(app); }
            },
            scope: this
        });
//
//        Ext.getCmp('headerBox').add( {
//            xtype: 'rallycheckboxfield',
//            fieldLabel: 'Show Help',
//            id: 'helpButton',
//            margin: 10,
//            listeners: {
//                change: function() {
//                    if (this.value === true) {
//                        Ext.getCmp('helptext').show();
//                    } else {
//                        Ext.getCmp('helptext').hide();
//                    }
//                }
//            },
//            scope: this
//        });
//
//        var helptext = Ext.create('Rally.ui.dialog.Dialog', {
//             autoShow: true,
//             hidden: true,
//             id: 'helptext',
//             draggable: true,
//             width: 300,
//             title: 'Brief Help',
//             items: {
//                 xtype: 'component',
//                 html: 'WSJF = (Risk + Value + Urgency)/Size',
//                 padding: 10
//             }
//         });
//
//        Ext.getCmp('headerBox').add( helptext );
//

    },

    _getFilters: function(app) {
        var filters = [];

        // We do not have timeboxes on higher level portfolio items

        if ( Ext.getCmp('itemType').getRecord().data.Ordinal === 0) {
            var timeboxscope = this.getContext().getTimeboxScope();
            if (timeboxscope) {
                var filterQuery = timeboxscope.getQueryFilter();
                if (filterQuery.value){
                    filters.push(filterQuery.value.config);
                }
                else {
                    filters.push({
                            property: 'Release',
                            operator: '=',
                            value: null

                    });
                }
            }
        }

        filters.push({
                        property: 'State.Name',
                        operator: '!=',
                        value: 'Done'
                    });

        //Now get the settings query box and apply those settings
        var queryString = app.getSetting('query');
        if (queryString) {
            Ext.getCmp('MakeItSo').hide();  //Don't allow committing if subselected
            Ext.getCmp('globalCheck').hide();
            var filterObj = Rally.data.wsapi.Filter.fromQueryString(queryString);
            filterObj.itemId = filterObj.toString();
            filters.push( filterObj );
        }

        return filters;
    },

    _startApp: function(app) {

        var modeltype = 'portfolioitem/' + Ext.getCmp('itemType').rawValue;
        var modelNames = [modeltype];

        var oldGrid = Ext.getCmp('piGrid');

        if (oldGrid) oldGrid.destroy();

        var columnCfgs = [
                'FormattedID',
                'Name',
                {
                    dataIndex: 'Project',
                    text: 'Project',
                    align: 'center'
                },
                {
                    dataIndex: 'RROEValue',
                    text: 'RR/OE',
                    align: 'center'
                },
                {
                    dataIndex: 'UserBusinessValue',
                    text: 'User/Business Value',
                    align: 'center'
                },
                {
                    dataIndex: 'TimeCriticality',
                    text: 'Time Criticality',
                    align: 'center'
                }
        ];

        // If we are using preliminary estimate, pick up that instead.

        if (app.getSetting('usePrelim')) {
            columnCfgs.push(
                {
                    dataIndex: 'PreliminaryEstimate',
                    text: 'Size',
                    align: 'center'
                });
        } else {
            columnCfgs.push(
                {
                    dataIndex: 'JobSize',
                    text: 'Size',
                    align: 'center'
                });

        }
        if (app.getSetting('useWSJFReadOnly')) {

            columnCfgs.push(
                {
                    dataIndex: 'WSJFScore',
                    text: 'WSJF',
                    align: 'center',
                    editor: null
                });
        }else {
            columnCfgs.push(
                {
                    dataIndex: 'WSJFScore',
                    text: 'WSJF',
                    align: 'center'
                });
        }



        var grid = Ext.create('Rally.ui.grid.Grid', {
            id: 'piGrid',
            margin: 30,

            columnCfgs: columnCfgs,

            bulkEditConfig: {
                showEdit: false,
                showTag: false,
                showParent: false,
                showRemove: false
            },
            context: this.getContext(),
            enableBulkEdit: true,
            enableRanking: true,
            enableColumnResize: true,
            sortableColumns: true,

            storeConfig: {
                pageSize: 200,
                batchAction: true,
                model: modelNames,
                sorters: [
                    {
                        property: 'WSJFScore',
                        direction: 'DESC'
                    },
                    {
                        property: 'DragAndDropRank',
                        direction: 'ASC'
                    }
                ],
                fetch: ['FormattedID', 'PreliminaryEstimate', 'Name', 'Release', 'Project', 'JobSize', 'RROEValue', 'TimeCriticality', 'UserBusinessValue', 'WSJFScore', 'State'],
                filters: app._getFilters(app)
            },
            
            listeners: {
                inlineeditsaved: function( grid, record, opts) {
                    this._saveWSJF(record);
                },
                load: function(store) {
                    if (app.getSetting('useWSJFOverLoad')) {

                        var records = store.getRecords();
                        _.each(records, this._saveWSJF);
                    }
                }
            },

            _saveWSJF: function(record) {
                var num = 0;
                var oldVal = record.get('WSJFScore').toFixed(2);

                if (app.getSetting('usePrelim')) {
                    if (record.get('PreliminaryEstimate') && ((peVal = record.get('PreliminaryEstimate').Value) > 0)) {
                        num = (record.get('RROEValue') + record.get('UserBusinessValue') + record.get('TimeCriticality'))/record.get('PreliminaryEstimate').Value;
                    }
                } else {
                     num = (record.get('RROEValue') + record.get('UserBusinessValue') + record.get('TimeCriticality'))/record.get('JobSize');
                }

                //if the field is 'decimal' you can only have two decimal places....or it doesn't save it!
                num = num.toFixed(2);

                if ( num !== oldVal) {
                    record.set('WSJFScore', num);
                    record.save( {
                        callback: function() {
                            if (app.getSetting('useWSJFAutoSort')){
                                Ext.getCmp('piGrid').refresh();
                            }
                        }
                    });
                }
            }

        });

        Ext.util.Observable.capture( grid, function(event) { console.log(event, arguments);});

        this.add(grid);

    },

    _recordToRank: 0,
    _rankingRecord: null,
    _store: null,

    _storeRecords: function() {

        this._store = Ext.getCmp('piGrid').store;
        this._recordToRank = 0;
        this._rankingRecord = this._store.data.items[this._recordToRank];

        if (Ext.getCmp('globalCheck').value === true){

            this._rankingRecord.save( {
                rankTo: 'TOP',
                callback: function(arg1, arg2, arg3) {
                    this._recordToRank += 1;
                    this._saveNextRecord();
                },
                scope: this
            });
        }
        else
        {
            this._recordToRank += 1;
            this._saveNextRecord();
        }
    },

    _saveNextRecord: function ()
    {
        if ( this._recordToRank < this._store.totalCount){
            var nextRecord = this._store.data.items[this._recordToRank];
            Rally.data.Ranker.rankRelative( {
                recordToRank: nextRecord,
                relativeRecord: this._rankingRecord,
                position: 'after',
                saveOptions: {
                    callback: function(arg1, arg2, arg3){
                        this._recordToRank += 1;
                        this._rankingRecord = arg1;
                        this._saveNextRecord();
                    },
                    scope: this
                }
            });
        }
    }



});

Ext.define('dataModel', {
    extend: 'Ext.data.Model',
    fields: [
        {name: 'Name',  type: 'string'  },
        {name: 'Value', type: 'integer' }
    ]
});


Ext.define('wsjfBulkSetRisk', {
    extend:  Rally.ui.menu.bulk.MenuItem ,
    alias: 'widget.wsjfBulkSetRisk',

    config: {
        text: 'Risk',
        handler: function(arg1, arg2, arg3) {
            this._onSetRisk(arg1, arg2, arg3);
        }
    },

    _onSetRisk: function(arg1, arg2, arg3) {
        var data = {
            dataValues: [
                { 'Name':'None', 'Value': 1 },
                { 'Name':'Minimal', 'Value': 3 },
                { 'Name':'Low', 'Value': 5 },
                { 'Name':'Medium', 'Value': 8 },
                { 'Name':'High', 'Value': 13 },
                { 'Name':'Extreme', 'Value': 21 }
            ]
        };

        var store = Ext.create('Ext.data.Store', {
            autoLoad: true,
            model: 'dataModel',
            data: data,
            proxy: {
                type: 'memory',
                reader: {
                    type: 'json',
                    root: 'dataValues'
                }
            }
        });

        var riskBox = Ext.create( 'Ext.form.ComboBox', {
            id: 'riskBox',
            store: store,
            queryMode: 'local',
            displayField: 'Name',
            valueField: 'Value'
        });

        var doChooser = Ext.create( 'Rally.ui.dialog.Dialog', {
            id: 'riskChooser',
            autoShow: true,
            draggable: true,
            width: 300,
            records: this.records,
            title: 'Choose Risk setting',
            items: riskBox,
            buttons: [
                {   text: 'OK',
                    handler: function(arg1, arg2, arg3) {
                        _.each(this.records, function(record) {
                            record.set('RROEValue', Ext.getCmp('riskBox').value);
                            var num = (record.get('RROEValue') + record.get('UserBusinessValue') + record.get('TimeCriticality'))/record.get('JobSize');

                            //if the field is 'decimal' you can only have two decimal places....
                            record.set('WSJFScore', num.toFixed(2));
                            record.save( {
                                    callback: function() {
                                        if (app.getSetting('useWSJFAutoSort')){
                                            Ext.getCmp('piGrid').refresh();
                                        }

                                        Ext.getCmp('riskChooser').destroy();
                                    }
                            });
                        });
                    },
                    scope: this
                }
            ]
        });
    }
});

Ext.define('wsjfBulkSetValue', {
    extend:  Rally.ui.menu.bulk.MenuItem ,
    alias: 'widget.wsjfBulkSetValue',

    config: {
        text: 'Business Value',
        handler: function(arg1, arg2, arg3) {
            this._onSetValue(arg1, arg2, arg3);
        }
    },

    _onSetValue: function(arg1, arg2, arg3) {
        var data = {
            dataValues: [
                { 'Name':'None', 'Value': 1 },
                { 'Name':'Minimal', 'Value': 3 },
                { 'Name':'Low', 'Value': 5 },
                { 'Name':'Medium', 'Value': 8 },
                { 'Name':'High', 'Value': 13 },
                { 'Name':'Extreme', 'Value': 21 }
            ]
        };

        var store = Ext.create('Ext.data.Store', {
            autoLoad: true,
            model: 'dataModel',
            data: data,
            proxy: {
                type: 'memory',
                reader: {
                    type: 'json',
                    root: 'dataValues'
                }
            }
        });

        var valueBox = Ext.create( 'Ext.form.ComboBox', {
            id: 'valueBox',
            store: store,
            queryMode: 'local',
            displayField: 'Name',
            valueField: 'Value'
        });

        var doChooser = Ext.create( 'Rally.ui.dialog.Dialog', {
            id: 'valueChooser',
            autoShow: true,
            draggable: true,
            width: 300,
            records: this.records,
            title: 'Choose Business Value setting',
            items: valueBox,
            buttons: [
                {   text: 'OK',
                    handler: function(arg1, arg2, arg3) {
                        _.each(this.records, function(record) {
                            record.set('UserBusinessValue', Ext.getCmp('valueBox').value);
                            var num = (record.get('RROEValue') + record.get('UserBusinessValue') + record.get('TimeCriticality'))/record.get('JobSize');

                            //if the field is 'decimal' you can only have two decimal places....
                            record.set('WSJFScore', num.toFixed(2));
                            record.save( {
                                    callback: function() {
                                        if (app.getSetting('useWSJFAutoSort')){
                                            Ext.getCmp('piGrid').refresh();
                                        }
                                        Ext.getCmp('valueChooser').destroy();
                                    }
                            });
                        });
                    },
                    scope: this
                }
            ]
        });
    }
});

Ext.define('wsjfBulkSetTime', {
    extend:  Rally.ui.menu.bulk.MenuItem ,
    alias: 'widget.wsjfBulkSetTime',

    config: {
        text: 'Time Criticality',
        handler: function(arg1, arg2, arg3) {
            this._onSetTime(arg1, arg2, arg3);
        }
    },

    _onSetTime: function(arg1, arg2, arg3) {
        var data = {
            dataValues: [
                { 'Name':'None', 'Value': 1 },
                { 'Name':'Minimal', 'Value': 3 },
                { 'Name':'Low', 'Value': 5 },
                { 'Name':'Medium', 'Value': 8 },
                { 'Name':'High', 'Value': 13 },
                { 'Name':'Extreme', 'Value': 21 }
            ]
        };

        var store = Ext.create('Ext.data.Store', {
            autoLoad: true,
            model: 'dataModel',
            data: data,
            proxy: {
                type: 'memory',
                reader: {
                    type: 'json',
                    root: 'dataValues'
                }
            }
        });

        var timeBox = Ext.create( 'Ext.form.ComboBox', {
            id: 'timeBox',
            store: store,
            queryMode: 'local',
            displayField: 'Name',
            valueField: 'Value'
        });

        var doChooser = Ext.create( 'Rally.ui.dialog.Dialog', {
            id: 'timeChooser',
            autoShow: true,
            draggable: true,
            width: 300,
            records: this.records,
            title: 'Choose Time Criticality',
            items: timeBox,
            buttons: [
                {   text: 'OK',
                    handler: function(arg1, arg2, arg3) {
                        _.each(this.records, function(record) {
                            record.set('TimeCriticality', Ext.getCmp('timeBox').value);
                            var num = (record.get('RROEValue') + record.get('UserBusinessValue') + record.get('TimeCriticality'))/record.get('JobSize');

                            //if the field is 'decimal' you can only have two decimal places....
                            record.set('WSJFScore', num.toFixed(2));
                            record.save( {
                                    callback: function() {
                                        if (app.getSetting('useWSJFAutoSort')){
                                            Ext.getCmp('piGrid').refresh();
                                        }
                                        Ext.getCmp('timeChooser').destroy();
                                    }
                            });
                        });
                    },
                    scope: this
                }
            ]
        });
    }
});
Ext.define('wsjfBulkSetSize', {
    extend:  Rally.ui.menu.bulk.MenuItem ,
    alias: 'widget.wsjfBulkSetSize',

    config: {
        text: 'Job Size',
        handler: function(arg1, arg2, arg3) {
            this._onSetSize(arg1, arg2, arg3);
        }
    },

    _onSetSize: function(arg1, arg2, arg3) {
        var data = {
            dataValues: [
                { 'Name':'XS', 'Value': 1 },
                { 'Name':'S', 'Value': 2 },
                { 'Name':'M', 'Value': 3 },
                { 'Name':'L', 'Value': 5 },
                { 'Name':'XL', 'Value': 8 },
                { 'Name':'XXL', 'Value': 13 },
                { 'Name':'XXXL', 'Value': 21 }
            ]
        };

        var store = Ext.create('Ext.data.Store', {
            autoLoad: true,
            model: 'dataModel',
            data: data,
            proxy: {
                type: 'memory',
                reader: {
                    type: 'json',
                    root: 'dataValues'
                }
            }
        });

        var sizeBox = Ext.create( 'Ext.form.ComboBox', {
            id: 'sizeBox',
            store: store,
            queryMode: 'local',
            displayField: 'Name',
            valueField: 'Value'
        });

        var doChooser = Ext.create( 'Rally.ui.dialog.Dialog', {
            id: 'sizeChooser',
            autoShow: true,
            draggable: true,
            width: 300,
            records: this.records,
            title: 'Choose Job Size',
            items: sizeBox,
            buttons: [
                {   text: 'OK',
                    handler: function(arg1, arg2, arg3) {
                        _.each(this.records, function(record) {
                            record.set('JobSize', Ext.getCmp('sizeBox').value);
                            var num = (record.get('RROEValue') + record.get('UserBusinessValue') + record.get('TimeCriticality'))/record.get('JobSize');

                            //if the field is 'decimal' you can only have two decimal places....
                            record.set('WSJFScore', num.toFixed(2));
                            record.save( {
                                    callback: function() {
                                        if (app.getSetting('useWSJFAutoSort')){
                                            Ext.getCmp('piGrid').refresh();
                                        }
                                        Ext.getCmp('sizeChooser').destroy();
                                    }
                            });
                        });
                    },
                    scope: this
                }
            ]
        });
    }
});
