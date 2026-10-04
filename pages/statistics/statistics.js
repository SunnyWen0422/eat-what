const api = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')
const flow = require('../../utils/meal-workflow')
Page({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(), periodMode: 'week', selectedDate: flow.today(), rangeLabel: '', loading: true, errorMessage: '', report: null, categoryRows: [], dailyRows: [], recordRows: [] },
  onShow() { this.loadStatistics() }, onUnload() { this._epoch = (this._epoch || 0) + 1 },
  range() { const date=flow.parseDay(this.data.selectedDate); return this.data.periodMode==='week'?flow.weekRange(this.data.selectedDate):flow.monthRange(date.getFullYear(),date.getMonth()+1) },
  async loadStatistics() {
    const epoch=this._epoch=(this._epoch||0)+1, scope=getUserStorageKey('dietReview'), range=this.range(), current=()=>epoch===this._epoch&&scope===getUserStorageKey('dietReview')
    if(this._viewScope!==scope)this.setData({report:null,categoryRows:[],dailyRows:[],recordRows:[]})
    this._viewScope=scope
    this.setData({loading:true,errorMessage:'',rangeLabel:`${range.startDate} — ${range.endDate}`})
    try {
      const report=await api.getDietReview(range.startDate,range.endDate)
      if(!current())return
      const labels={meat:'荤菜',veg:'素菜',soup:'汤品',staple:'主食',dessert:'甜品',unknown:'未分类'}
      const categoryRows=Object.keys(labels).map(key=>({key,label:labels[key],count:(report.categories||{})[key]||0,percent:report.entryCount?Math.round(((report.categories||{})[key]||0)/report.entryCount*100):0}))
      const dailyRows=[]
      for(let date=range.startDate;date<=range.endDate;date=flow.shiftDay(date,1)){const count=(report.dailyMeals||{})[date]||0;dailyRows.push({date,label:date.slice(5),count,width:Math.round(count/3*100)})}
      const recordRows=(report.consumptions||[]).filter(x=>x.status==='eaten').map(x=>({...x,label:flow.mealNames[x.mealType],names:(x.actualDishes||[]).map(d=>d.name).join('、')})).reverse()
      this.setData({report,categoryRows,dailyRows,recordRows})
    }catch(error){if(current())this.setData({errorMessage:flow.errorMessage(error,'读取失败，请联网后重试。')})}
    finally{if(current())this.setData({loading:false})}
  },
  onMode(e){this.setData({periodMode:e.currentTarget.dataset.mode});this.loadStatistics()},
  move(amount){const current=flow.parseDay(this.data.selectedDate);const date=this.data.periodMode==='week'?flow.shiftDay(this.data.selectedDate,amount*7):flow.formatDay(new Date(current.getFullYear(),current.getMonth()+amount,1,12));if(date>flow.today())return wx.showToast({title:'未来用餐尚未记录',icon:'none'});this.setData({selectedDate:date});this.loadStatistics()},
  onPrevMonth(){this.move(-1)},onNextMonth(){this.move(1)},onCurrent(){this.setData({selectedDate:flow.today()});this.loadStatistics()},
  onRecord(e){wx.navigateTo({url:`/pages/calendar-detail/calendar-detail?date=${e.currentTarget.dataset.date||flow.today()}`})},
  onLogin(){wx.switchTab({url:'/pages/profile/profile'})}
})
