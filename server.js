const express = require('express');
const fs = require('fs');
const express_static = require('express-static');
const body_parser = require('body-parser'); //只能用来解析post过来的数据,不能解析post过来的文件
const mysql = require('mysql'); //express的插件,用于连接mysql
const svg_captcha = require('svg-captcha'); //用于生成svg验证码
const cookie_parser = require('cookie-parser');
const cookie_session = require('cookie-session');
const AlipaySdk = require('alipay-sdk').default; //蚂蚁金服sdk
const AlipayFormData = require('alipay-sdk/lib/form').default;

const db = mysql.createPool({
	host: 'localhost',
	user: 'root',
	password: 'wadrbswdar333',
	database: 'sell_food'
});
//这里因为服务器中没必要每一次请求都要连接一次数据库,因此使用的是"createPool"来创建一个连接池,每次保持一定数量的连接,空闲的连接接受请求,多于规定数量的连接请求就排队等待,哪边连接空闲了就去处理

//实例化sdk
const alipaysdk = new AlipaySdk({
	appId: '2016091900547479',
	privateKey: fs.readFileSync('./private-key.txt', 'ascii'),
	alipayPublicKey: fs.readFileSync('./public-key.txt', 'ascii'),
});

//let objMulter=multer({dest:'./www/upload'});//创建一个变量来储存multer的数据(必须这么干),中间的参数dest可以指定这个文件上传到服务器的哪个文件夹来保存

let server = express();
server.listen(2400);

server.use(body_parser.json());
server.use(body_parser.urlencoded({
	extended: true
})); //通过加入这个中间件,便使用req.body来解析post数据

//设置允许跨域访问
//server.use(function(req, res, next) {
//	res.header("Access-Control-Allow-Origin", "*");
//	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
//	next();
//});

server.all('*', function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "X-Requested-With");
	res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
	res.header("X-Powered-By", ' 3.2.1')
	res.header("Content-Type", "application/json;charset=utf-8");
	next();
});

//启用session
let keysArr = []; //整个session的加密密钥数组
keysArr.push("head"); //这里只放一个密钥就行,如果有多个,就在这个数组里循环使用这些密钥

server.use(cookie_session({
	name: 'session',
	keys: keysArr,

	//详细设置
	maxAge: 25 * 60 * 1000, //存在15min
}))

server.get('/captcha', function(req, res) {
	let captcha = svg_captcha.create();
	req.session.captcha = captcha.text; //session存储
	//	req.session.test='123'							//向json中添加新的元素的方法
	res.type('svg'); //设置访问响应的数据类型
	res.send(captcha.data)
})

server.post('/login', function(req, res) {
	const reqdata = req.body;
	//	console.log(reqdata);
	//	console.log(req.session);

	if(req.session.captcha.toLowerCase() == reqdata.captcha.toLowerCase()) {
		let sql = "select username,password,phone,src from user_table where (username='" + reqdata.name + "' || phone='" + reqdata.name + "')";
		db.query(sql, function(err, data) {
			if(data[0]) {
				if(data[0].password == reqdata.pwd) {
					//把登录状态写入session
					req.session.login = true;
					req.session.user = data[0].phone;

					res.send({
						OK: true,
						msg: '登录成功!',
						data: data[0]
					})
				} else {
					req.session.login = false;
					delete req.session.user;

					res.send({
						OK: false,
						msg: '用户名或密码错误!',
						data: {}
					})
				}
			} else {
				req.session.Login = false;
				delete req.session.user;
				
				res.send({
					OK: false,
					msg: '该用户不存在',
					data: {}
				})
			}

		})
	} else {
		res.send({
			OK: false,
			msg: '验证码错误!',
			data: {}
		})
	}

})

server.post('/sign', function(req, res) {
	console.log(req.body);
	res.send({
		OK: true,
		msg: '注册成功!'
	})
})

server.post('/login_state', function(req, res) {
	if(req.session.login == true) {
		const phone = req.session.user;
		db.query("select username,password,phone,src from user_table where phone='" + phone + "'", function(err, data) {
			if(data[0].phone) { //检查是否由此用户
				//如果存在,返回登录状态和用户信息
				res.send({
					login: true,
					data: data[0]
				})
			} else {
				//如果不存在,返回登录状态并清除错误的session信息
				req.session.login = false;
				delete req.session.user;
				res.send({
					login: false,
					data: {}
				})
			}
		})
	} else {
		req.session.login = false;
		delete req.session.user
		res.send({
			login: false,
			data: {}
		})
	}
})

server.get('/quit_login', function(req, res) {
	delete req.session.user;
	req.session.login = false;
	res.send({
		login: false,
		data: {}
	})
})

server.get('/storelist', function(req, res) {
	db.query("select * from store_table", function(err, data) {
		if(err) {
			res.send({
				OK: false,
				data: {},
				msg: '数据读取失败'
			})
		} else {
			for(let i in data) {
				if(data[i].Store_tags) {
					data[i].Store_tags = data[i].Store_tags.split(',');
				}
			}

			res.send({
				OK: true,
				data: data,
				msg: '数据读取成功'
			})
		}
	})
})

server.post('/shop_info', function(req, res) {
	const info = req.body;
	db.query("select * from store_table where ID='" + info.shop_id + "'", function(err, data) {
		if(err) {
			res.send({
				OK: false,
				data: {},
				msg: '数据读取失败'
			})
		} else {
			res.send({
				OK: true,
				data: data,
				msg: '数据读取成功'
			})
		}
	})
})

server.get('/banners', function(req, res) {
	db.query("select * from Banner_table", function(err, data) {
		if(err) {
			res.send({
				OK: false,
				data: {},
				msg: '数据读取失败'
			})
		} else {
			res.send({
				OK: true,
				data: data,
				msg: '数据读取成功'
			})
		}
	})
})

server.get('/shop_goods', function(req, res) {
	let shop_id = req.query.shop_id;
	if(shop_id) {
		db.query("select distinct class_name from goods_table where shop_id='" + shop_id + "'", function(err, data) {
			if(err) {
				res.send({
					OK: false,
					data: {},
					msg: '数据读取失败'
				})
			} else {
				let goods_data = data;
				db.query("select class_name,`name`,src,price,sell,`like`,tags from goods_table", function(err, data) {
					if(err) {
						res.send({
							OK: false,
							data: {},
							msg: '数据读取失败'
						})
					} else {
						for(let i = 0; i < goods_data.length; i++) {
							goods_data[i].foods = [];
							for(let j = 0; j < data.length; j++) {
								if(data[j].class_name == goods_data[i].class_name) {
									if(data[j].tags) {
										data[j].tags = data[j].tags.split(',');
									}
									goods_data[i].foods.push(data[j]);
								}
							}
						}
						res.send({
							OK: true,
							data: goods_data,
							msg: '数据读取成功'
						})
					}
				})
			}
		});
	}
})

server.get('/shop_comments', function(req, res) {
	let shop_id = req.query.shop_id;
	if(shop_id) {
		db.query("select * from comment_table where shop_id='" + shop_id + "'", function(err, data) {
			if(err) {
				res.send({
					OK: false,
					data: {},
					msg: '数据读取失败'
				})
			} else {
				let comments_data = data;
				res.send({
					OK: true,
					data: comments_data,
					msg: '数据读取成功'
				})
			}
		})
	}
})

server.get('/search', function(req, res) {
	let search = req.query.search;
	if(search) {
		db.query("select * from Store_table where Store_name like '%" + search + "%'", function(err, data) {
			if(err) {
				res.send({
					OK: false,
					data: {},
					msg: '数据读取失败'
				})
			} else {
				res.send({
					OK: true,
					data: data,
					msg: '数据读取成功'
				})
			}
		})
	}
})

server.all('/iknow', function(req, res) {
	if(req) {
		let pay_data = req.query;
		db.query("select * from user_table where phone='" + req.session.user + "'",function(err,user_data){
			user_data = user_data[0];
			user_data.username = user_data.username?user_data.username:'';
			let sql = "INSERT INTO comment_table (trade_no,shop_id,name,phone,time,point,food,price) VALUES ('" + pay_data.out_trade_no + "','" + req.session.pay_info.shop_id + "','" + user_data.username + "','" + user_data.phone + "','" + pay_data.timestamp.substr(0,10) + "','0','" + req.session.pay_info.name + "','" + req.session.pay_info.price + "')";
			db.query(sql,function(err,data){
				if(err){
					//把支付信息从session中去除
					delete req.session.pay_info;
					//跳转页面
					res.redirect('http://localhost:8080/#')
				}else{
					//把支付信息从session中去除
					delete req.session.pay_info;
					//跳转页面
					res.redirect('http://localhost:8080/#')
				}
			})
		})
	}
})

server.post('/pay', function(req, res) {
	let info = req.body;
	if(info) {
		//把支付信息存入session
		req.session.pay_info = info;
		const formData = new AlipayFormData();
		// 调用 setMethod 并传入 get，会返回可以跳转到支付页面的 url
		formData.setMethod('get');

//		formData.addField('notifyUrl', 'http://localhost:2400/iknow');
		formData.addField('returnUrl', 'http://localhost:2400/iknow');
		formData.addField('bizContent', {
			outTradeNo: info.trade_no,
			productCode: 'FAST_INSTANT_TRADE_PAY',
			totalAmount: info.price,
			subject: info.name,
			body: info.shop_id,
		});

		alipaysdk.exec(
			'alipay.trade.wap.pay', {}, {
				formData: formData
			},
		).then(result => {
			res.send({
				OK: true,
				data: result,
				msg: '连接创建成功'
			})
		});
	}
})

server.post('/history', function(req, res) {
	let user = req.body;
	if(user) {
		db.query("select * from comment_table where phone='" + user.userphone + "'", function(err, data) {
			if(err) {
				res.send({
					OK: false,
					data: {},
					msg: '数据读取失败'
				})
			} else {
				for(i in data) {
					let goods_obj = [];
					let goods = data[i].food.split(',');
					for(let j = 0; j < goods.length; j++) {
						goods_obj.push(goods[j])
					}
					data[i].food = goods_obj;
				}
				res.send({
					OK: true,
					data: data,
					msg: '数据读取成功'
				})
			}
		})
	}
})

server.post('/manager_login', function(req, res) {
	const info = req.body;
	db.query("select * from manager_table where (phone='" + info.user + "' || username='" + info.user + "')", function(err, data) {
		if(err) {
			res.send({
				Login: false,
				shop_id: '',
				msg: '数据库出错'
			})
		} else {
			if(data[0]) {
				if(info.pwd == data[0].password) {
					//把登录状态写入session
					req.session.manager_login = true;
					req.session.shop_id = data[0].shop_id;
					//返回登录状态
					res.send({
						Login: true,
						shop_id: data[0].shop_id,
						msg: '登录成功'
					})
				} else {
					res.send({
						Login: false,
						shop_id: '',
						msg: '密码错误'
					})
				}
			} else {
				res.send({
					Login: false,
					shop_id: '',
					msg: '账号不存在'
				})
			}

		}
	})
})

server.post('/manager_login_state', function(req, res) {
	if(req.session.manager_login == true) {
		if(req.session.shop_id) {
			res.send({
				Login: true,
				shop_id: req.session.shop_id,
				msg: '登录成功'
			})
		} else {
			req.session.manager_login = false;
			delete req.session.shop_id;
			res.send({
				Login: false,
				shop_id: '',
				msg: '登录状态错误'
			})
		}
	} else {
		req.session.manager_login = false;
		delete req.session.shop_id;
		res.send({
			Login: false,
			shop_id: '',
			msg: '暂无登录记录'
		})
	}
})

server.get('/manager_quit_login', function(req, res) {
	req.session.manager_login = false;
	delete req.session.shop_id;
	res.send({
		OK: true,
		msg: '已退出登录'
	})
})

server.post('/manager_update', function(req, res) {
	const sqldata = req.body;
	//	console.log(sqldata.sql);
	if(sqldata.sql){
		db.query(sqldata.sql, function(err, data) {
			if(err) {
				res.send({
					OK: false,
					msg: '数据库更新失败'
				})
			} else {
				res.send({
					OK: true,
					msg: '数据库更新成功'
				})
			}
		})
	}
})

server.use(express_static('./www'));