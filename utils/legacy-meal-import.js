function mealsFromSession(session) {
  const plan=(session.state || {}).plan || session.plan || {},people=Number((plan.period || {}).people || 2)
  if(!Number.isInteger(people) || people<1 || people>50)return []
  return (plan.meals || []).filter(meal=>/^\d{4}-\d{2}-\d{2}$/.test(meal.date) && ['breakfast','lunch','dinner'].includes(meal.meal_type)).map(meal=>({date:meal.date,mealType:meal.meal_type,mealName:({breakfast:'早餐',lunch:'午餐',dinner:'晚餐'})[meal.meal_type],people,version:plan.version,names:(meal.dishes || []).map(d=>d.name).join('、'),dishIds:[...new Set((meal.dishes || []).map(d=>Number(d.id))) ]})).filter(meal=>meal.dishIds.length>0 && meal.dishIds.length<=10 && meal.dishIds.every(id=>Number.isSafeInteger(id) && id>0))
}
module.exports={mealsFromSession}
