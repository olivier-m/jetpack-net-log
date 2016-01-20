# Changelog

## 1.2 (2016-01-20)

- Compatibility with Firefox having multi-process enabled (Firefox > 45a2 )
- har collector object :
   - the property `listener` has been changed by a method `getListener()`.
   - it has two new methods: `register()` and `unregister()`. They initialize/unregister
     internally a page progress object and a net log object.
     You don't have to unregister your self page progress object and net log object
     corresponding to the browser, when you want to remove a har collector from
     a browser. Just call `unregister()` instead of `stop()` in this case.


## 1.1 (2013-03-22)

- added an HAR collector
- reorganized internal architecture

## 1.0 (2013-03-15)