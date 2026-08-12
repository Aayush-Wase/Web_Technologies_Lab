package com.example;
import java.io.IOException;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.*;

public class ElectricityServlet extends HttpServlet {


    protected void doPost(HttpServletRequest request,
                          HttpServletResponse response)
            throws ServletException, IOException {


        String unitString = request.getParameter("units");

        double units = Double.parseDouble(unitString);

        double bill = calculateBill(units);


        request.setAttribute("units", units);

        request.setAttribute("bill", bill);


        request.getRequestDispatcher("result.jsp")
               .forward(request, response);

    }



    public double calculateBill(double units)
    {

        double amount = 0;


        if(units <= 50)
        {
            amount = units * 3.50;
        }


        else if(units <= 150)
        {
            amount = (50 * 3.50)
                    +
                    ((units-50) * 4.00);
        }


        else if(units <= 250)
        {
            amount = (50 * 3.50)
                    +
                    (100 * 4.00)
                    +
                    ((units-150) * 5.20);
        }


        else
        {
            amount = (50 * 3.50)
                    +
                    (100 * 4.00)
                    +
                    (100 * 5.20)
                    +
                    ((units-250) * 6.50);
        }


        return amount;

    }

}