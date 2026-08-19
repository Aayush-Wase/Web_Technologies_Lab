<%@ page language="java"
         contentType="text/html; charset=UTF-8"
         pageEncoding="UTF-8"%>

<!DOCTYPE html>
<html lang="en">

<head>

    <meta charset="UTF-8">

    <meta name="viewport"
          content="width=device-width, initial-scale=1.0">

    <title>Electricity Bill Calculator</title>

    <style>

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: Arial, sans-serif;
            min-height: 100vh;

            display: flex;
            justify-content: center;
            align-items: center;

            padding: 20px;

            background:
                linear-gradient(
                    135deg,
                    #2563eb,
                    #06b6d4
                );
        }

        .container {
            width: 100%;
            max-width: 500px;

            background: white;

            padding: 30px;

            border-radius: 18px;

            box-shadow:
                0 15px 40px
                rgba(0, 0, 0, 0.2);
        }

        h1 {
            text-align: center;
            color: #1e293b;
            margin-bottom: 10px;
        }

        .subtitle {
            text-align: center;
            color: #64748b;
            margin-bottom: 25px;
        }

        .form-group {
            margin-bottom: 20px;
        }

        label {
            display: block;

            font-weight: bold;

            color: #334155;

            margin-bottom: 8px;
        }

        input {
            width: 100%;

            padding: 13px;

            border: 1px solid #cbd5e1;

            border-radius: 8px;

            font-size: 16px;
        }

        input:focus {
            outline: none;

            border-color: #2563eb;

            box-shadow:
                0 0 0 3px
                rgba(37, 99, 235, 0.1);
        }

        button {
            width: 100%;

            padding: 14px;

            background: #2563eb;

            color: white;

            border: none;

            border-radius: 8px;

            font-size: 17px;

            font-weight: bold;

            cursor: pointer;
        }

        button:hover {
            background: #1d4ed8;
        }

        .slabs {
            margin-top: 25px;

            padding: 15px;

            background: #f8fafc;

            border-radius: 10px;

            color: #64748b;

            font-size: 14px;
        }

        .slabs h3 {
            color: #334155;

            margin-bottom: 10px;
        }

        .slabs p {
            margin: 5px 0;
        }

        .result {
            margin-top: 25px;

            background: #f1f5f9;

            border-radius: 12px;

            padding: 20px;
        }

        .result h2 {
            text-align: center;

            color: #1e293b;

            margin-bottom: 15px;
        }

        .bill-row {
            display: flex;

            justify-content: space-between;

            padding: 10px 0;

            border-bottom:
                1px solid #cbd5e1;

            color: #475569;
        }

        .total {
            margin-top: 12px;

            padding-top: 15px;

            border-top:
                2px solid #2563eb;

            border-bottom: none;

            font-size: 20px;

            font-weight: bold;

            color: #1d4ed8;
        }

        .error {
            margin-top: 20px;

            padding: 12px;

            background: #fee2e2;

            color: #b91c1c;

            border-radius: 8px;

            text-align: center;
        }

        @media (max-width: 500px) {

            .container {
                padding: 22px;
            }

            h1 {
                font-size: 25px;
            }

        }

    </style>

</head>

<body>

<div class="container">

    <h1>⚡ Electricity Bill Calculator</h1>

    <p class="subtitle">
        Calculate your electricity bill instantly
    </p>


    <!-- Input Form -->

    <form method="post">

        <div class="form-group">

            <label for="units">
                Enter Units Consumed
            </label>

            <input
                type="number"
                id="units"
                name="units"
                min="0"
                step="1"
                placeholder="Example: 180"
                required
            >

        </div>

        <button type="submit">
            Calculate Bill
        </button>

    </form>


    <!-- Electricity Rates -->

    <div class="slabs">

        <h3>Electricity Rates</h3>

        <p>First 50 units: ₹3.50/unit</p>

        <p>Next 100 units: ₹4.00/unit</p>

        <p>Next 100 units: ₹5.20/unit</p>

        <p>Above 250 units: ₹6.50/unit</p>

    </div>


<%

    String unitsInput = request.getParameter("units");

    if (unitsInput != null &&
        !unitsInput.trim().isEmpty()) {

        try {

            int units =
                Integer.parseInt(unitsInput);

            if (units < 0) {

%>

                <div class="error">
                    Please enter a valid number of units.
                </div>

<%

            } else {

                double bill = 0;


                /*
                 * Slab 1:
                 * First 50 units
                 */

                if (units <= 50) {

                    bill =
                        units * 3.50;

                }


                /*
                 * Slab 2:
                 * 51 - 150
                 */

                else if (units <= 150) {

                    bill =
                        (50 * 3.50)
                        +
                        ((units - 50) * 4.00);

                }


                /*
                 * Slab 3:
                 * 151 - 250
                 */

                else if (units <= 250) {

                    bill =
                        (50 * 3.50)
                        +
                        (100 * 4.00)
                        +
                        ((units - 150) * 5.20);

                }


                /*
                 * Slab 4:
                 * Above 250
                 */

                else {

                    bill =
                        (50 * 3.50)
                        +
                        (100 * 4.00)
                        +
                        (100 * 5.20)
                        +
                        ((units - 250) * 6.50);

                }

%>

                <!-- Bill Result -->

                <div class="result">

                    <h2>Bill Details</h2>

                    <div class="bill-row">

                        <span>
                            Units Consumed
                        </span>

                        <strong>
                            <%= units %> units
                        </strong>

                    </div>


                    <div class="bill-row">

                        <span>
                            Energy Charges
                        </span>

                        <strong>
                            ₹ <%= String.format(
                                "%.2f", bill
                            ) %>
                        </strong>

                    </div>


                    <div class="bill-row total">

                        <span>
                            Total Bill
                        </span>

                        <span>
                            ₹ <%= String.format(
                                "%.2f", bill
                            ) %>
                        </span>

                    </div>

                </div>

<%

            }

        }
        catch (NumberFormatException e) {

%>

            <div class="error">
                Please enter a valid numeric value.
            </div>

<%

        }

    }

%>

</div>

</body>

</html>