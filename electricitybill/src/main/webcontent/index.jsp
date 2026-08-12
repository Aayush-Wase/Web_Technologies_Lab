<!DOCTYPE html>
<html>

<head>

<title>Electricity Bill Calculator</title>


<!-- Bootstrap -->

<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css"
rel="stylesheet">


<!-- jQuery -->

<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>


</head>


<body class="bg-light">


<div class="container mt-5">


<div class="card shadow p-4">


<h2 class="text-center text-primary">
Electricity Bill Calculator
</h2>


<form action="ElectricityServlet" 
method="post"
id="billForm">


<div class="mb-3">

<label class="form-label">
Enter Units Consumed
</label>


<input type="number"
class="form-control"
name="units"
id="units"
required>

</div>



<button class="btn btn-primary w-100">

Calculate Bill

</button>


</form>


</div>

</div>



<script>


$("#billForm").submit(function(){

let units=$("#units").val();


if(units<=0)
{
alert("Please enter valid units");
return false;
}


});


</script>


</body>

</html>